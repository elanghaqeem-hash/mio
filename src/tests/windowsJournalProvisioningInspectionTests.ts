import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { inspectWindowsJournalProvisioning } from '../observability/WindowsJournalProvisioningInspector';
const insist = (ok: unknown, why: string) => { if (!ok) throw Error(why); };
const EMPTY = crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');
function fixture(callback:(root:string,name:string)=>void): void {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-provision-inspect-'));
  const name='trusted_project.journal';
  try { callback(root,name); } finally { fs.rmSync(root,{recursive:true,force:true}); }
}
function provision(root:string,name:string): void {
  const pathname=path.join(root,name);
  fs.writeFileSync(pathname, Buffer.alloc(0), {flag:'wx'});
  const manifest={ version:1,journalName:name,journalSha256:EMPTY,initialBytes:0,
    initializedBy:'EXTERNAL_TRUSTED_PROVISIONER' };
  fs.writeFileSync(pathname+'.manifest.json',JSON.stringify(manifest),{flag:'wx'});
}
export async function runWindowsJournalProvisioningInspectionTests():Promise<{passed:number;total:number}> {
  const tests:Array<[string,()=>void]> = [
    ['absent journal is never provisioned or marked verified',()=>fixture((root,name)=>{
      const result=inspectWindowsJournalProvisioning(root,name);
      insist(!result.verified && !result.activationPermitted,'missing journal admitted');
      insist(fs.readdirSync(root).length===0,'inspector created files');
    })],
    ['existing empty journal and exact manifest pass diagnostic but cannot activate runtime',()=>fixture((root,name)=>{
      provision(root,name);
      const result=inspectWindowsJournalProvisioning(root,name);
      insist(result.verified && result.logicalHistoryValid && !result.metadataPublicationDurable &&
        !result.activationPermitted,'diagnostic incorrectly permits activation');
    })],
    ['wrong manifest digest and extra fields are denied',()=>fixture((root,name)=>{
      provision(root,name);
      const filename=path.join(root,name+'.manifest.json');
      const raw=JSON.parse(fs.readFileSync(filename,'utf8'));
      raw.journalSha256='0'.repeat(64);
      fs.writeFileSync(filename,JSON.stringify(raw));
      insist(!inspectWindowsJournalProvisioning(root,name).verified,'bad digest accepted');
      raw.journalSha256=EMPTY;raw.extra=true;
      fs.writeFileSync(filename,JSON.stringify(raw));
      insist(!inspectWindowsJournalProvisioning(root,name).verified,'extra key accepted');
    })],
    ['nonempty existing journal requires separate reviewed migration before provisioning claim',()=>fixture((root,name)=>{
      provision(root,name);
      fs.appendFileSync(path.join(root,name),'unauthorized');
      const result=inspectWindowsJournalProvisioning(root,name);
      insist(!result.verified && !result.activationPermitted,'nonempty journal marked initial snapshot');
    })],
    ['unsafe project filename and symlinked journal are denied',()=>fixture((root,name)=>{
      provision(root,name);
      insist(!inspectWindowsJournalProvisioning(root,'../out.journal').verified,'traversal name accepted');
      const alias=path.join(root,'alias.journal');
      try {
        fs.symlinkSync(path.join(root,name),alias,'file');
        fs.copyFileSync(path.join(root,name+'.manifest.json'),alias+'.manifest.json');
        insist(!inspectWindowsJournalProvisioning(root,'alias.journal').verified,'symlink accepted');
      } catch(error) {
        // Some Windows runners restrict symlink creation. The input validator
        // above still runs; skip symlink fixture only on explicit OS denial.
        const code=(error as NodeJS.ErrnoException).code;
        if (!['EPERM','EACCES'].includes(code ?? '')) throw error;
      }
    })],
  ];
  let passed=0;
  for (const [name,run] of tests){run();passed++;console.log('✓ [PASS] '+name);}
  return {passed,total:tests.length};
}
