// Diagnostic only: Node stat identities, not a native Win32 handle guarantee.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-file-id-'));
const target=path.join(root,'journal'), replacement=path.join(root,'replacement'), moved=path.join(root,'original');
let fd;
const identity=s=>({dev:s.dev,ino:s.ino});
const equal=(a,b)=>a.ino!==0n&&b.ino!==0n&&a.dev===b.dev&&a.ino===b.ino;
try {
  fs.writeFileSync(target,'original',{flag:'wx'});
  fs.writeFileSync(replacement,'replacement',{flag:'wx'});
  const before=identity(fs.lstatSync(target,{bigint:true}));
  fd=fs.openSync(target,'r');
  const held=identity(fs.fstatSync(fd,{bigint:true}));
  const other=identity(fs.lstatSync(replacement,{bigint:true}));
  assert.ok(equal(before,held),'pathname/handle identity unavailable or inconsistent');
  assert.ok(!equal(held,other)&&other.ino!==0n,'distinct file identity unavailable');
  let outcome;
  try {fs.renameSync(target,moved);}
  catch(e) {if(!['EPERM','EACCES','EBUSY'].includes(e.code))throw e; outcome='rename_blocked';}
  if(!outcome){
    fs.renameSync(replacement,target);
    assert.ok(!equal(held,identity(fs.lstatSync(target,{bigint:true}))),'replacement not detected');
    assert.ok(equal(held,identity(fs.fstatSync(fd,{bigint:true}))),'held file identity changed');
    assert.equal(fs.readFileSync(fd,'utf8'),'original');
    outcome='replacement_detected';
  }
  console.log(JSON.stringify({platform:process.platform,node:process.version,outcome,productionDurability:false,nativeWin32HandleVerified:false}));
} finally {if(fd!==undefined)fs.closeSync(fd);fs.rmSync(root,{recursive:true,force:true});}
