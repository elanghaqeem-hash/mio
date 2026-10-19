import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { computeProvisioningMac, verifyWindowsJournalAttestation, type SignedJournalProvisioningV1 } from '../observability/WindowsJournalAuthenticatedProvisioning';

const assert=(ok:unknown,why:string)=>{if(!ok)throw Error(why);};
const key=Buffer.alloc(32,0xa4);
function fixture(run:(root:string,name:string)=>void):void {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-provision-hmac-'));
 const name='sample.journal';
 try {
  const journal=path.join(root,name);
  fs.writeFileSync(journal,Buffer.alloc(0),{flag:'wx'});
  const digest=crypto.createHash('sha256').update('').digest('hex');
  const manifest={version:1,journalName:name,journalSha256:digest,initialBytes:0,initializedBy:'EXTERNAL_TRUSTED_PROVISIONER'};
  fs.writeFileSync(journal+'.manifest.json',JSON.stringify(manifest),{flag:'wx'});
  const unsigned:Omit<SignedJournalProvisioningV1,'mac'>={
   version:1,journalName:name,journalSha256:digest,
   manifestSha256:crypto.createHash('sha256').update(fs.readFileSync(journal+'.manifest.json')).digest('hex'),
   scope:'MIO_WINDOWS_PROVISIONING_DIAGNOSTIC',
  };
  fs.writeFileSync(journal+'.attestation.json',JSON.stringify({...unsigned,mac:computeProvisioningMac(key,unsigned)}),{flag:'wx'});
  run(root,name);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
export async function runWindowsJournalAuthenticatedProvisioningTests():Promise<{passed:number,total:number}>{
 const cases:Array<[string,()=>void]>=[
  ['valid independent key authenticates initial snapshot without enabling runtime',()=>fixture((root,name)=>{
   const v=verifyWindowsJournalAttestation(root,name,key);
   assert(v.authenticated&&v.initialJournalVerified&&!v.metadataPublicationDurable&&!v.runtimeActivationPermitted,'invalid trusted verdict');
  })],
  ['incorrect key never authenticates provisioning',()=>fixture((root,name)=>{
   assert(!verifyWindowsJournalAttestation(root,name,Buffer.alloc(32,0xb3)).authenticated,'wrong key authenticated');
   assert(!verifyWindowsJournalAttestation(root,name,Buffer.alloc(8)).authenticated,'short key authenticated');
  })],
  ['manifest modification invalidates authentication',()=>fixture((root,name)=>{
   fs.appendFileSync(path.join(root,name+'.manifest.json'),' ');
   assert(!verifyWindowsJournalAttestation(root,name,key).authenticated,'manifest edit accepted');
  })],
  ['tampered MAC and extra fields fail closed',()=>fixture((root,name)=>{
   const file=path.join(root,name+'.attestation.json');
   const record=JSON.parse(fs.readFileSync(file,'utf8'));
   record.mac='0'.repeat(64);fs.writeFileSync(file,JSON.stringify(record));
   assert(!verifyWindowsJournalAttestation(root,name,key).authenticated,'forged MAC accepted');
   record.extra=true;fs.writeFileSync(file,JSON.stringify(record));
   assert(!verifyWindowsJournalAttestation(root,name,key).authenticated,'extra fields accepted');
  })],
  ['journal modification and unsafe name reject authentication',()=>fixture((root,name)=>{
   fs.appendFileSync(path.join(root,name),'unsafe');
   assert(!verifyWindowsJournalAttestation(root,name,key).authenticated,'changed journal accepted');
   assert(!verifyWindowsJournalAttestation(root,'../evil.journal',key).authenticated,'traversal accepted');
  })],
 ];
 let passed=0;for(const [label,test] of cases){test();passed++;console.log('✓ [PASS] '+label);}
 return {passed,total:cases.length};
}
