import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { encodeJournalRecord, decodeJournalRecords } from '../../src/observability/WindowsJournalBinaryCodec';
import { WindowsCheckpointJournalPrototype } from '../../src/observability/WindowsCheckpointJournalPrototype';
assert.equal(process.platform,'win32');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-native-codec-'));
try {
 const file=path.join(root,'journal'), fixture=path.join(root,'record');
 fs.writeFileSync(file,Buffer.alloc(0));
 const proto=new WindowsCheckpointJournalPrototype(file);
 const first=proto.append(JSON.stringify({phase:'PREPARED'}));
 const before=fs.readFileSync(file);
 const second=encodeJournalRecord(JSON.stringify({phase:'EXECUTING'}),Buffer.from(first.digest,'hex'),before.length);
 fs.writeFileSync(fixture,second.record);
 const result=spawnSync('pwsh',['-NoProfile','-File','scripts/benchmarks/windows-native-binary-append.ps1',file,fixture],{encoding:'utf8',timeout:30000});
 assert.ifError(result.error);
 assert.equal(result.status,0,result.stderr);
 const bytes=fs.readFileSync(file);
 assert.deepEqual(bytes,Buffer.concat([before,second.record]));
 assert.equal(proto.inspect().at(-1)?.digest,second.digest.toString('hex'));
 const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;
 assert.throws(()=>decodeJournalRecords(corrupt),/HASH_CHAIN_BROKEN/);
 assert.throws(()=>decodeJournalRecords(bytes.subarray(0,-1)),/TORN/);
 console.log(JSON.stringify({probe:'PRV-11.04a',binaryInterop:'pass',corruptionDenied:true,tornTailDenied:true,productionReady:false}));
} finally {fs.rmSync(root,{recursive:true,force:true});}
