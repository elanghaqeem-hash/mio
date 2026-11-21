# PRV-11.03k: diagnostic only; never enables production checkpoint writes.
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'MIO_NATIVE_WINDOWS_REQUIRED' }
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.ComponentModel;
using Microsoft.Win32.SafeHandles;
public static class MioNativeIdentityProbe {
    [StructLayout(LayoutKind.Sequential)]
    private struct FileId { public ulong Volume; public ulong Low; public ulong High; }
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int cls, out FileId id, uint size);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern bool MoveFileEx(string source, string target, uint flags);
    public static string Identity(FileStream stream) {
        FileId id;
        if (!GetFileInformationByHandleEx(stream.SafeFileHandle, 18, out id, (uint)Marshal.SizeOf<FileId>()))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        return id.Volume.ToString("X16")+":"+id.High.ToString("X16")+id.Low.ToString("X16");
    }
    public static int Rename(string source, string target) {
        return MoveFileEx(source, target, 0) ? 0 : Marshal.GetLastWin32Error();
    }
}
'@
function Assert-Probe($condition, $message) {
    if (-not $condition) { throw $message }
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('mio-native-id-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$journal = Join-Path $root 'journal'
$moved = Join-Path $root 'moved'
$held = $null
try {
    [IO.File]::WriteAllText($journal, 'original')
    $held = [IO.File]::Open($journal, 'Open', 'ReadWrite', 'Read')
    $id = [MioNativeIdentityProbe]::Identity($held)
    $reader = [IO.File]::Open($journal, 'Open', 'Read', 'ReadWrite')
    try { Assert-Probe ([MioNativeIdentityProbe]::Identity($reader) -eq $id) 'HANDLE_ID_DISAGREEMENT' }
    finally { $reader.Dispose() }
    $renameError = [MioNativeIdentityProbe]::Rename($journal, $moved)
    Assert-Probe ($renameError -in @(5,32)) "RENAME_NOT_DENIED_AS_EXPECTED: $renameError"
    Assert-Probe ((Test-Path -LiteralPath $journal) -and -not (Test-Path -LiteralPath $moved)) 'PATH_CHANGED_WHILE_HELD'
    $writeDenied = $false
    try {
        $other = [IO.File]::Open($journal, 'Open', 'Write', 'ReadWrite')
        $other.Dispose()
    } catch [IO.IOException] {
        $writeDenied = (($_.Exception.HResult -band 65535) -eq 32)
    }
    Assert-Probe $writeDenied 'COMPETING_WRITER_NOT_DENIED'
    Assert-Probe ([MioNativeIdentityProbe]::Identity($held) -eq $id) 'HELD_ID_CHANGED'
    $held.Dispose(); $held = $null
    Assert-Probe ([MioNativeIdentityProbe]::Rename($journal, $moved) -eq 0) 'RENAME_CONTROL_FAILED'
    [IO.File]::WriteAllText($journal, 'replacement')
    $a = [IO.File]::OpenRead($moved)
    try { Assert-Probe ([MioNativeIdentityProbe]::Identity($a) -eq $id) 'RENAMED_ID_CHANGED' }
    finally { $a.Dispose() }
    $b = [IO.File]::OpenRead($journal)
    try { Assert-Probe ([MioNativeIdentityProbe]::Identity($b) -ne $id) 'REPLACEMENT_ID_NOT_DISTINCT' }
    finally { $b.Dispose() }
    Assert-Probe ([IO.File]::ReadAllText($moved) -eq 'original') 'ORIGINAL_CONTENT_CHANGED'
    [ordered]@{probe='PRV-11.03k'; status='pass'; os=[Environment]::OSVersion.VersionString; renameError=$renameError; productionReady=$false} | ConvertTo-Json -Compress
} finally {
    if ($null -ne $held) { $held.Dispose() }
    Remove-Item -LiteralPath $root -Recurse -Force
}
