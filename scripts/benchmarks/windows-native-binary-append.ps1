param([Parameter(Mandatory=$true)][string]$Journal,[Parameter(Mandatory=$true)][string]$Fixture)
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
# Test-only bridge: append pre-encoded binary record to isolated CI fixture.
$bytes = [IO.File]::ReadAllBytes($Fixture)
if ($bytes.Length -lt 43 -or $bytes.Length -gt 262186) { throw 'INVALID_FIXTURE_LENGTH' }
$held = [MioHandleJournalProbe]::Open($Journal)
try {
    if ($held.Length + $bytes.Length -gt 8388608) { throw 'JOURNAL_LIMIT' }
    [MioHandleJournalProbe]::Append($held,$bytes)
} finally { $held.Dispose() }
