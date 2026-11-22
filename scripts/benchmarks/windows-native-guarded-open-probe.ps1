# Diagnostic only. Validate final-component reparse denial on live Win32 handles.
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'MIO_NATIVE_WINDOWS_REQUIRED' }
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.ComponentModel;
using Microsoft.Win32.SafeHandles;
public static class MioGuardedOpen {
    [StructLayout(LayoutKind.Sequential)]
    private struct AttributeTag { public uint Attributes; public uint Tag; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int cls, out AttributeTag tag, uint size);
    public static SafeFileHandle Open(string path) {
        // OPEN_EXISTING, GENERIC_READ, FILE_SHARE_READ, OPEN_REPARSE_POINT | BACKUP_SEMANTICS.
        SafeFileHandle h = CreateFileW(path, 0x80000000, 1, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
        if (h.IsInvalid) { int error=Marshal.GetLastWin32Error(); h.Dispose(); throw new Win32Exception(error); }
        try {
            AttributeTag tag;
            if (!GetFileInformationByHandleEx(h, 9, out tag, (uint)Marshal.SizeOf<AttributeTag>()))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            if ((tag.Attributes & 0x410) != 0 || tag.Tag != 0)
                throw new InvalidDataException("MIO_UNSAFE_FILE_TYPE");
            return h;
        } catch { h.Dispose(); throw; }
    }
}
'@
function Assert-Rejected($path) {
    try { $h = [MioGuardedOpen]::Open($path) }
    catch {
        $cause = $_.Exception.GetBaseException()
        if ($cause -is [IO.InvalidDataException] -and $cause.Message -eq 'MIO_UNSAFE_FILE_TYPE') { return }
        throw
    }
    $h.Dispose()
    throw 'MIO_UNSAFE_TARGET_ACCEPTED'
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('mio-guarded-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$target = Join-Path $root 'journal'
$dir = Join-Path $root 'directory'
$link = Join-Path $root 'junction'
try {
    [IO.File]::WriteAllText($target, 'original')
    [IO.Directory]::CreateDirectory($dir) | Out-Null
    $h = [MioGuardedOpen]::Open($target)
    try { if ($h.IsInvalid) { throw 'MIO_VALID_FILE_REJECTED' } } finally { $h.Dispose() }
    Assert-Rejected $dir
    New-Item -ItemType Junction -Path $link -Target $dir | Out-Null
    Assert-Rejected $link
    if ([IO.File]::ReadAllText($target) -ne 'original') { throw 'MIO_CONTENT_CHANGED' }
    [ordered]@{probe='PRV-11.03l'; regularFile='pass'; directory='denied'; junction='denied'; productionReady=$false; parentPathProtected=$false} | ConvertTo-Json -Compress
} finally {
    if (Test-Path -LiteralPath $link) { [IO.Directory]::Delete($link) }
    Remove-Item -LiteralPath $root -Recurse -Force
}
