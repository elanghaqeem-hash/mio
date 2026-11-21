# PRV-11.04d — isolated trusted directory and ACL diagnostic, not runtime admission.
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
        var h=CreateFileW(path,0x81,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
        if(h.IsInvalid){int e=Marshal.GetLastWin32Error();h.Dispose();throw new Win32Exception(e);}
        try {
            AttributeTag a;
            if(!GetFileInformationByHandleEx(h,9,out a,(uint)Marshal.SizeOf<AttributeTag>()))throw new Win32Exception(Marshal.GetLastWin32Error());
            if((a.Attributes&0x10)==0 || (a.Attributes&0x400)!=0 || a.Tag!=0)throw new InvalidDataException("MIO_UNSAFE_DIRECTORY");
            Identity(h);return h;
        }catch{h.Dispose();throw;}
    }
    public static string Identity(SafeFileHandle h){
        FileId id;
        if(!GetFileInformationByHandleEx(h,18,out id,(uint)Marshal.SizeOf<FileId>()))throw new Win32Exception(Marshal.GetLastWin32Error());
        return id.Volume.ToString("X16")+":"+id.High.ToString("X16")+id.Low.ToString("X16");
    }
    public static int Rename(string a,string b){return MoveFileEx(a,b,0)?0:Marshal.GetLastWin32Error();}
}
'@
function Assert-PrivateAcl($path,$ownerSid){
    $acl=Get-Acl -LiteralPath $path
    if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $ownerSid.Value) {throw 'MIO_ACL_OWNER_OR_INHERITANCE'}
    $rules=$acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])
    if ($rules.Count -ne 1) {throw 'MIO_ACL_RULE_COUNT'}
    $rule=$rules[0]
    if($rule.IdentityReference.Value -ne $ownerSid.Value -or $rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or $rule.IsInherited){throw 'MIO_ACL_RULE_UNSAFE'}
}
$root=Join-Path ([IO.Path]::GetTempPath()) ('mio-dir-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$dir=Join-Path $root 'trusted'
$moved=Join-Path $root 'moved'
$link=Join-Path $root 'junction'
$h=$null
try{
    [IO.Directory]::CreateDirectory($dir)|Out-Null
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl=[Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true,$false)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    Set-Acl -LiteralPath $dir -AclObject $acl
    Assert-PrivateAcl $dir $sid
    $h=[MioDirectoryProbe]::Open($dir)
    $id=[MioDirectoryProbe]::Identity($h)
    $other=[MioDirectoryProbe]::Open($dir)
    try{if([MioDirectoryProbe]::Identity($other)-ne $id){throw 'MIO_DIRECTORY_ID_MISMATCH'}}finally{$other.Dispose()}
    $err=[MioDirectoryProbe]::Rename($dir,$moved)
    if($err -notin @(5,32)){throw "MIO_DIRECTORY_RENAME_NOT_DENIED: $err"}
    New-Item -ItemType Junction -Path $link -Target $dir|Out-Null
    $denied=$false
    try{$j=[MioDirectoryProbe]::Open($link);$j.Dispose()}catch{
        $cause=$_.Exception.GetBaseException()
        if($cause -isnot [IO.InvalidDataException] -or $cause.Message -ne 'MIO_UNSAFE_DIRECTORY'){throw}
        $denied=$true
    }
    if(-not $denied){throw 'MIO_JUNCTION_ACCEPTED'}
    $h.Dispose();$h=$null
    if([MioDirectoryProbe]::Rename($dir,$moved)-ne 0){throw 'MIO_RENAME_CONTROL_FAILED'}
    $h=[MioDirectoryProbe]::Open($moved)
    if([MioDirectoryProbe]::Identity($h)-ne $id){throw 'MIO_DIRECTORY_ID_CHANGED'}
    $h.Dispose();$h=$null
    $bad=Get-Acl -LiteralPath $moved
    $everyone=[Security.Principal.SecurityIdentifier]::new('S-1-1-0')
    $bad.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($everyone,'ReadAndExecute','Allow'))
    Set-Acl -LiteralPath $moved -AclObject $bad
    $denied=$false
    try{Assert-PrivateAcl $moved $sid}catch{if($_.Exception.Message -notlike 'MIO_ACL_*'){throw};$denied=$true}
    if(-not $denied){throw 'MIO_BROAD_ACL_ACCEPTED'}
    [ordered]@{probe='PRV-11.04d';privateAcl='pass';broadAcl='denied';directoryIdentity='pass';renameWhileHeld='denied';junction='denied';productionReady=$false}|ConvertTo-Json -Compress
}finally{
    if($null-ne $h){$h.Dispose()}
    if([IO.Directory]::Exists($link) -or (Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue)){[IO.Directory]::Delete($link)}
    Remove-Item -LiteralPath $root -Recurse -Force
}
