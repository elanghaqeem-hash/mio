# PRV-11.03m — isolated native handle-bound journal I/O diagnostic.
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'MIO_NATIVE_WINDOWS_REQUIRED' }
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.ComponentModel;
using Microsoft.Win32.SafeHandles;
public static class MioHandleJournalProbe {
    [StructLayout(LayoutKind.Sequential)]
    private struct AttributeTag { public uint Attributes; public uint Tag; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int cls, out AttributeTag tag, uint size);
    public static FileStream Open(string path) {
        SafeFileHandle h = CreateFileW(path, 0xC0000000, 1, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
        if (h.IsInvalid) { int error=Marshal.GetLastWin32Error(); h.Dispose(); throw new Win32Exception(error); }
        try {
            AttributeTag tag;
            if (!GetFileInformationByHandleEx(h, 9, out tag, (uint)Marshal.SizeOf<AttributeTag>()))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            if ((tag.Attributes & 0x410) != 0 || tag.Tag != 0)
                throw new InvalidDataException("MIO_UNSAFE_FILE_TYPE");
            return new FileStream(h, FileAccess.ReadWrite);
        } catch { h.Dispose(); throw; }
    }
    public static void Append(FileStream stream, byte[] bytes) {
        stream.Seek(0, SeekOrigin.End);
        stream.Write(bytes, 0, bytes.Length);
        stream.Flush(true);
    }
    public static string Inspect(FileStream stream) {
        stream.Seek(0, SeekOrigin.Begin);
        using (var reader = new StreamReader(stream, new System.Text.UTF8Encoding(false, true), false, 1024, true))
            return reader.ReadToEnd();
    }
}
'@
$root = Join-Path ([IO.Path]::GetTempPath()) ('mio-handle-io-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$file = Join-Path $root 'journal'
$held = $null
try {
    [IO.File]::WriteAllBytes($file, [byte[]]@())
    $held = [MioHandleJournalProbe]::Open($file)
    $first = "PREPARED" + [char]10
    $second = "EXECUTING" + [char]10
    [MioHandleJournalProbe]::Append($held, [Text.Encoding]::UTF8.GetBytes($first))
    if ([MioHandleJournalProbe]::Inspect($held) -cne $first) { throw 'FIRST_READBACK_MISMATCH' }
    $denied = $false
    try { $other = [IO.File]::Open($file, 'Open', 'Write', 'ReadWrite'); $other.Dispose() }
    catch [IO.IOException] { $denied = (($_.Exception.HResult -band 65535) -eq 32) }
    if (-not $denied) { throw 'COMPETING_WRITER_NOT_DENIED' }
    [MioHandleJournalProbe]::Append($held, [Text.Encoding]::UTF8.GetBytes($second))
    if ([MioHandleJournalProbe]::Inspect($held) -cne ($first + $second)) { throw 'SECOND_READBACK_MISMATCH' }
    $held.Dispose(); $held = $null
    $held = [MioHandleJournalProbe]::Open($file)
    if ([MioHandleJournalProbe]::Inspect($held) -cne ($first + $second)) { throw 'REOPEN_READBACK_MISMATCH' }
    [ordered]@{probe='PRV-11.03m';sameHandleReadWrite='pass';competingWriter='denied';reopen='pass';productionReady=$false;powerLossVerified=$false} | ConvertTo-Json -Compress
} finally {
    if ($null -ne $held) { $held.Dispose() }
    Remove-Item -LiteralPath $root -Recurse -Force
}
