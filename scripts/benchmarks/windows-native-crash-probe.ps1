# PRV-11.03n — isolated hard-link and native process-death diagnostics.
param([string]$ChildFile, [string]$ReadyFile)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'MIO_NATIVE_WINDOWS_REQUIRED' }
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.ComponentModel;
using Microsoft.Win32.SafeHandles;
public static class MioCrashGuard {
    [StructLayout(LayoutKind.Sequential)]
    private struct StandardInfo {
        public long AllocationSize, EndOfFile;
        public uint NumberOfLinks;
        public byte DeletePending, Directory;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int cls, out StandardInfo info, uint size);
    [StructLayout(LayoutKind.Sequential)]
    private struct AttributeTag { public uint Attributes, Tag; }
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int cls, out AttributeTag info, uint size);
    public static FileStream Open(string path) {
        SafeFileHandle h = CreateFileW(path, 0xC0000000, 1, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
        if (h.IsInvalid) { int error=Marshal.GetLastWin32Error(); h.Dispose(); throw new Win32Exception(error); }
        try {
            StandardInfo info; AttributeTag tag;
            if (!GetFileInformationByHandleEx(h, 1, out info, (uint)Marshal.SizeOf<StandardInfo>()) ||
                !GetFileInformationByHandleEx(h, 9, out tag, (uint)Marshal.SizeOf<AttributeTag>()))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            if (info.NumberOfLinks != 1 || info.DeletePending != 0 || info.Directory != 0 ||
                (tag.Attributes & 0x410) != 0 || tag.Tag != 0)
                throw new InvalidDataException("MIO_UNSAFE_JOURNAL");
            return new FileStream(h, FileAccess.ReadWrite);
        } catch { h.Dispose(); throw; }
    }
}
'@
if ($ChildFile) {
    if (-not $ReadyFile) { throw 'MISSING_READY_FILE' }
    $stream = [MioCrashGuard]::Open($ChildFile)
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes("PREPARED`nEXECUTING`n")
        $stream.Write($bytes,0,$bytes.Length)
        $stream.Flush($true)
        [IO.File]::WriteAllText($ReadyFile, 'flushed')
        while ($true) { Start-Sleep -Seconds 1 }
    } finally { $stream.Dispose() }
    exit
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('mio-crash-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$file = Join-Path $root 'journal'
$alias = Join-Path $root 'alias'
$ready = Join-Path $root 'ready'
$child = $null
try {
    [IO.File]::WriteAllBytes($file,[byte[]]@())
    New-Item -ItemType HardLink -Path $alias -Target $file | Out-Null
    $denied = $false
    try { $s = [MioCrashGuard]::Open($file); $s.Dispose() }
    catch {
        $cause = $_.Exception.GetBaseException()
        if ($cause -isnot [IO.InvalidDataException] -or $cause.Message -ne 'MIO_UNSAFE_JOURNAL') { throw }
        $denied = $true
    }
    if (-not $denied) { throw 'HARD_LINK_ACCEPTED' }
    Remove-Item -LiteralPath $alias
    $psi = [Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = (Get-Process -Id $PID).Path
    $psi.UseShellExecute = $false
    foreach ($arg in @('-NoProfile','-File',$PSCommandPath,'-ChildFile',$file,'-ReadyFile',$ready)) { $psi.ArgumentList.Add($arg) }
    $child = [Diagnostics.Process]::Start($psi)
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    while (-not (Test-Path -LiteralPath $ready)) {
        if ($child.HasExited -or [DateTime]::UtcNow -gt $deadline) { throw 'CHILD_NOT_READY' }
        Start-Sleep -Milliseconds 100
    }
    if ($child.HasExited) { throw 'CHILD_EXITED_BEFORE_KILL' }
    $child.Kill()
    if (-not $child.WaitForExit(10000)) { throw 'CHILD_KILL_TIMEOUT' }
    $s = [MioCrashGuard]::Open($file)
    try {
        $reader = [IO.StreamReader]::new($s)
        try { $actual = $reader.ReadToEnd() } finally { $reader.Dispose() }
        if ($actual -cne "PREPARED`nEXECUTING`n") { throw 'CRASH_READBACK_MISMATCH' }
    } finally { $s.Dispose() }
    [ordered]@{probe='PRV-11.03n';hardLink='denied';processDeath='pass';fixtureReadback='pass';productionReady=$false;powerLossVerified=$false} | ConvertTo-Json -Compress
} finally {
    if ($null -ne $child) { if (-not $child.HasExited) { $child.Kill(); $child.WaitForExit(10000) | Out-Null }; $child.Dispose() }
    Remove-Item -LiteralPath $root -Recurse -Force
}
