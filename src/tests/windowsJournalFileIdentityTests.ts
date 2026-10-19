import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WindowsCheckpointJournalPrototype } from '../observability/WindowsCheckpointJournalPrototype';
const assert=(value:unknown,msg:string)=>{if(!value)throw Error(msg);};
const rejects=(work:()=>unknown)=>{try{work();return false;}catch{return true;}};
export async function runWindowsJournalFileIdentityTests():Promise<{passed:number,total:number}> {
 const cases:Array<[string,()=>void]>=[
  ['reject directories and non-regular files as journal targets',()=>{
   const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-journal-id-'));
   try {
    const journal=new WindowsCheckpointJournalPrototype(root);
    assert(rejects(()=>journal.inspect())&&rejects(()=>journal.append('{"test":true}')),'directory accepted as journal');
   }finally{fs.rmSync(root,{recursive:true,force:true});}
  }],
  ['reject journal symlinks on platforms where creation is allowed',()=>{
   const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-journal-id-'));
   try {
    const original=path.join(root,'real.journal');
    fs.writeFileSync(original,Buffer.alloc(0),{flag:'wx'});
    const link=path.join(root,'link.journal');
    let created=false;
    try {fs.symlinkSync(original,link,'file');created=true;}
    catch(e){const code=(e as NodeJS.ErrnoException).code;if(!['EPERM','EACCES'].includes(code??''))throw e;}
    if(created){
     const probe=new WindowsCheckpointJournalPrototype(link);
     assert(rejects(()=>probe.inspect())&&rejects(()=>probe.append('{"test":true}')),'symlink journal accepted');
    }
   }finally{fs.rmSync(root,{recursive:true,force:true});}
  }],
  ['regular preprovisioned journal still permits validated append/reload',()=>{
   const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-journal-id-'));
   try {
    const filename=path.join(root,'existing.journal');
    fs.writeFileSync(filename,Buffer.alloc(0),{flag:'wx'});
    const writer=new WindowsCheckpointJournalPrototype(filename);
    writer.append('{"phase":"PREPARED"}');
    const reopened=new WindowsCheckpointJournalPrototype(filename).inspect();
    assert(reopened.length===1&&reopened[0].json==='{"phase":"PREPARED"}','safe journal failed');
   }finally{fs.rmSync(root,{recursive:true,force:true});}
  }],
 ];
 let passed=0;
 for(const [name,run] of cases){run();passed++;console.log('✓ [PASS] '+name);}
 return {passed,total:cases.length};
}
