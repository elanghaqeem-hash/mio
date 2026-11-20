param([Parameter(Mandatory=$true)][string]$Journal,[Parameter(Mandatory=$true)][string]$Fixture)
# PRV-11.04c — isolated logical transaction diagnostic; never production authorization.
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'MIO_NATIVE_WINDOWS_REQUIRED' }
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.ComponentModel;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;
public static class MioHandleJournalProbe {
    [StructLayout(LayoutKind.Sequential)]
    private struct AttributeTag { public uint Attributes; public uint Tag; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int cls, out AttributeTag tag, uint size);
    [StructLayout(LayoutKind.Sequential)]
    private struct StandardInfo { public long AllocationSize, EndOfFile; public uint NumberOfLinks; public byte DeletePending, Directory; }
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int cls, out StandardInfo info, uint size);
    public static FileStream Open(string path) {
        SafeFileHandle h = CreateFileW(path, 0xC0000000, 1, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
        if (h.IsInvalid) { int error=Marshal.GetLastWin32Error(); h.Dispose(); throw new Win32Exception(error); }
        try {
            AttributeTag tag;
            if (!GetFileInformationByHandleEx(h, 9, out tag, (uint)Marshal.SizeOf<AttributeTag>()))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            if ((tag.Attributes & 0x410) != 0 || tag.Tag != 0)
                throw new InvalidDataException("MIO_UNSAFE_FILE_TYPE");
            StandardInfo info;
            if (!GetFileInformationByHandleEx(h, 1, out info, (uint)Marshal.SizeOf<StandardInfo>()))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            if (info.NumberOfLinks != 1 || info.DeletePending != 0 || info.Directory != 0)
                throw new InvalidDataException("MIO_UNSAFE_JOURNAL");
            return new FileStream(h, FileAccess.ReadWrite);
        } catch { h.Dispose(); throw; }
    }
    private const int Max = 8388608;
    private static int Validate(byte[] bytes) {
        if (bytes.Length > Max) throw new InvalidDataException("MIO_LIMIT");
        byte[] previous = new byte[32];
        int offset=0, count=0;
        var states = new Dictionary<string,(long Sequence,string Phase)>();
        string preceding=null;
        while(offset < bytes.Length) {
            if(bytes.Length-offset < 42 || Encoding.ASCII.GetString(bytes,offset,6)!="MIOJ01")
                throw new InvalidDataException("MIO_HEADER");
            uint length=((uint)bytes[offset+6]<<24)|((uint)bytes[offset+7]<<16)|((uint)bytes[offset+8]<<8)|bytes[offset+9];
            if(length==0 || length>262144 || length>(uint)(bytes.Length-offset-42))
                throw new InvalidDataException("MIO_LENGTH");
            byte[] payload=new byte[(int)length];
            Buffer.BlockCopy(bytes,offset+42,payload,0,payload.Length);
            byte[] hashInput=new byte[32+payload.Length];
            Buffer.BlockCopy(previous,0,hashInput,0,32);
            Buffer.BlockCopy(payload,0,hashInput,32,payload.Length);
            byte[] digest=SHA256.HashData(hashInput);
            if(!CryptographicOperations.FixedTimeEquals(digest,new ReadOnlySpan<byte>(bytes,offset+10,32)))
                throw new InvalidDataException("MIO_HASH");
            using(var doc=JsonDocument.Parse(new UTF8Encoding(false,true).GetString(payload), new JsonDocumentOptions { MaxDepth=256 })) {
                var e=doc.RootElement;
                if(e.ValueKind!=JsonValueKind.Object) throw new InvalidDataException("MIO_LOGICAL_SCHEMA");
                var fields=new HashSet<string>();
                foreach(var prop in e.EnumerateObject()) {
                    if(!fields.Add(prop.Name) || !new HashSet<string>{"version","projectId","taskId","requestId","sequence","phase","previousDigest"}.Contains(prop.Name))
                        throw new InvalidDataException("MIO_LOGICAL_SCHEMA");
                }
                if(fields.Count!=7 || e.GetProperty("version").ValueKind!=JsonValueKind.Number || !e.GetProperty("version").TryGetInt32(out int version) || version!=1)
                    throw new InvalidDataException("MIO_LOGICAL_SCHEMA");
                string[] ids=new string[3]; int i=0;
                foreach(string name in new[]{"projectId","taskId","requestId"}) {
                    var v=e.GetProperty(name);
                    if(v.ValueKind!=JsonValueKind.String || !Regex.IsMatch(v.GetString(),@"\A[A-Za-z0-9_.:-]{1,120}\z"))
                        throw new InvalidDataException("MIO_LOGICAL_SCHEMA");
                    ids[i++]=v.GetString();
                }
                var seq=e.GetProperty("sequence"); var phaseValue=e.GetProperty("phase"); var prior=e.GetProperty("previousDigest");
                if(seq.ValueKind!=JsonValueKind.Number || !seq.TryGetInt64(out long n) || n<1 || n>9007199254740991L || phaseValue.ValueKind!=JsonValueKind.String)
                    throw new InvalidDataException("MIO_LOGICAL_SCHEMA");
                string phase=phaseValue.GetString();
                if((preceding==null && prior.ValueKind!=JsonValueKind.Null) || (preceding!=null && (prior.ValueKind!=JsonValueKind.String || prior.GetString()!=preceding)))
                    throw new InvalidDataException("MIO_LOGICAL_PREVIOUS");
                string key=string.Join("|",ids);
                bool allowed=states.TryGetValue(key,out var old)
                    ? n==old.Sequence+1 && ((old.Phase=="PREPARED" && (phase=="EXECUTING" || phase=="UNCERTAIN")) || (old.Phase=="EXECUTING" && (phase=="COMMITTED" || phase=="UNCERTAIN")))
                    : n==1 && phase=="PREPARED";
                if(!allowed) throw new InvalidDataException("MIO_LOGICAL_TRANSITION");
                states[key]=(n,phase);
                preceding=Convert.ToHexString(digest).ToLowerInvariant();
            }
            previous=digest; offset+=42+payload.Length; count++;
        }
        return count;
    }
    private static byte[] ReadAll(FileStream stream) {
        if(stream.Length>Max) throw new InvalidDataException("MIO_LIMIT");
        stream.Position=0;
        byte[] bytes=new byte[(int)stream.Length];
        int offset=0;
        while(offset<bytes.Length) { int n=stream.Read(bytes,offset,bytes.Length-offset); if(n==0) throw new EndOfStreamException(); offset+=n; }
        return bytes;
    }
    public static void AppendValidated(FileStream stream, byte[] record) {
        byte[] before=ReadAll(stream);
        int count=Validate(before);
        if(record.Length>262186 || record.Length<43 || before.Length+record.Length>Max)
            throw new InvalidDataException("MIO_LIMIT");
        byte[] expected=new byte[before.Length+record.Length];
        Buffer.BlockCopy(before,0,expected,0,before.Length);
        Buffer.BlockCopy(record,0,expected,before.Length,record.Length);
        if(Validate(expected)!=count+1) throw new InvalidDataException("MIO_RECORD_COUNT");
        Append(stream,record);
        if(!CryptographicOperations.FixedTimeEquals(ReadAll(stream),expected))
            throw new IOException("MIO_READBACK");
    }
    private static void Append(FileStream stream, byte[] bytes) {
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
# Diagnostic only: bounded fixture. No production admission.
$inputFile = [IO.FileInfo]::new($Fixture)
if ($inputFile.Length -lt 43 -or $inputFile.Length -gt 262186) { throw 'INVALID_FIXTURE_LENGTH' }
$bytes = [IO.File]::ReadAllBytes($Fixture)
$held = [MioHandleJournalProbe]::Open($Journal)
try { [MioHandleJournalProbe]::AppendValidated($held,$bytes) }
finally { $held.Dispose() }
