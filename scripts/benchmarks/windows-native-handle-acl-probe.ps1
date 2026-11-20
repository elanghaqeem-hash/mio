# PRV-11.04e — isolated handle-bound security descriptor diagnostic, not runtime admission.
$ErrorActionPreference='Stop'
if (-not $IsWindows) { throw 'MIO_NATIVE_WINDOWS_REQUIRED' }
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class MioDirectoryProbe {
    [StructLayout(LayoutKind.Sequential)]
    private struct AttributeTag { public uint Attributes, Tag; }
    [StructLayout(LayoutKind.Sequential)]
    private struct FileId { public ulong Volume, Low, High; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern SafeFileHandle CreateFileW(string name,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle h,int cls,out AttributeTag info,uint size);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle h,int cls,out FileId info,uint size);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern bool MoveFileEx(string source,string target,uint flags);
    public static SafeFileHandle Open(string path) {
        var h=CreateFileW(path,0x20080,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
        if(h.IsInvalid){int e=Marshal.GetLastWin32Error();h.Dispose();throw new Win32Exception(e);}
        try {
            AttributeTag a;
            if(!GetFileInformationByHandleEx(h,9,out a,(uint)Marshal.SizeOf<AttributeTag>()))throw new Win32Exception(Marshal.GetLastWin32Error());
            if((a.Attributes&0x10)==0 || (a.Attributes&0x400)!=0 || a.Tag!=0)throw new InvalidDataException("MIO_UNSAFE_DIRECTORY");
            Identity(h);return h;
        }catch{h.Dispose();throw;}
    }
    [DllImport("advapi32.dll", SetLastError=true)]
    private static extern uint GetSecurityInfo(SafeFileHandle handle, int type, uint flags, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
    [DllImport("advapi32.dll", SetLastError=true)]
    private static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr ptr);
    public static byte[] Descriptor(SafeFileHandle h) {
        IntPtr owner,group,dacl,sacl,sd;
        uint error=GetSecurityInfo(h,1,5,out owner,out group,out dacl,out sacl,out sd);
        if(error!=0 || sd==IntPtr.Zero){if(sd!=IntPtr.Zero)LocalFree(sd);throw new Win32Exception((int)error);}
        try {
            uint length=GetSecurityDescriptorLength(sd);
            if(length<20 || length>65536)throw new InvalidDataException("MIO_DESCRIPTOR_LENGTH");
            byte[] bytes=new byte[(int)length];
            Marshal.Copy(sd,bytes,0,bytes.Length);
            return bytes;
        }finally{LocalFree(sd);}
    }
    public static string Identity(SafeFileHandle h){
        FileId id;
        if(!GetFileInformationByHandleEx(h,18,out id,(uint)Marshal.SizeOf<FileId>()))throw new Win32Exception(Marshal.GetLastWin32Error());
        return id.Volume.ToString("X16")+":"+id.High.ToString("X16")+id.Low.ToString("X16");
    }
    public static int Rename(string a,string b){return MoveFileEx(a,b,0)?0:Marshal.GetLastWin32Error();}
}
'@
function Assert-HandleAcl($handle,$sid){
    $bytes=[MioDirectoryProbe]::Descriptor($handle)
    $sd=[Security.AccessControl.RawSecurityDescriptor]::new($bytes,0)
    $flags=$sd.ControlFlags
    if($sd.Owner.Value -ne $sid.Value -or -not ($flags -band [Security.AccessControl.ControlFlags]::DiscretionaryAclProtected) -or -not ($flags -band [Security.AccessControl.ControlFlags]::DiscretionaryAclPresent) -or $null -eq $sd.DiscretionaryAcl){throw 'MIO_HANDLE_ACL_DESCRIPTOR'}
    if($sd.DiscretionaryAcl.Count -ne 1){throw 'MIO_HANDLE_ACL_COUNT'}
    $ace=$sd.DiscretionaryAcl[0]
    if($ace -isnot [Security.AccessControl.CommonAce] -or $ace.IsCallback -or $ace.AceQualifier -ne 'AccessAllowed' -or $ace.SecurityIdentifier.Value -ne $sid.Value -or $ace.AccessMask -ne 2032127 -or [int]$ace.AceFlags -ne 3){throw 'MIO_HANDLE_ACL_RULE'}
}
$root=Join-Path ([IO.Path]::GetTempPath()) ('mio-handle-acl-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$dir=Join-Path $root 'trusted'
$h=$null
try{
    [IO.Directory]::CreateDirectory($dir)|Out-Null
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl=[Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true,$false)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    Set-Acl -LiteralPath $dir -AclObject $acl
    $h=[MioDirectoryProbe]::Open($dir)
    $identity=[MioDirectoryProbe]::Identity($h)
    Assert-HandleAcl $h $sid
    $bad=Get-Acl -LiteralPath $dir
    $everyone=[Security.Principal.SecurityIdentifier]::new('S-1-1-0')
    $bad.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($everyone,'ReadAndExecute','Allow'))
    Set-Acl -LiteralPath $dir -AclObject $bad
    $denied=$false
    try{Assert-HandleAcl $h $sid}catch{if($_.Exception.Message -notlike 'MIO_HANDLE_ACL_*'){throw};$denied=$true}
    if(-not $denied){throw 'MIO_BROAD_HANDLE_ACL_ACCEPTED'}
    Set-Acl -LiteralPath $dir -AclObject $acl
    Assert-HandleAcl $h $sid
    if([MioDirectoryProbe]::Identity($h)-ne $identity){throw 'MIO_HANDLE_ID_CHANGED'}
    [ordered]@{probe='PRV-11.04e';handleAcl='pass';changedAcl='denied';restoredAcl='pass';sameIdentity='pass';productionReady=$false}|ConvertTo-Json -Compress
}finally{
    if($null -ne $h){$h.Dispose()}
    Remove-Item -LiteralPath $root -Recurse -Force
}
