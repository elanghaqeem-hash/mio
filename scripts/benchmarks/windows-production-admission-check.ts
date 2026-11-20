import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import { createExclusiveNodeCheckpointRuntime } from '../../src/observability/ExclusiveNodeCheckpointRuntime';

assert.equal(process.platform, 'win32', 'Native Windows runner required');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-admission-'));
try {
  const existing = path.join(root, 'existing');
  fs.mkdirSync(existing);
  fs.writeFileSync(path.join(existing, 'sentinel'), 'unchanged');
  for (const target of [existing, path.join(root, 'absent')]) {
    assert.throws(() => createExclusiveNodeCheckpointRuntime(target),
      { message: 'CHECKPOINT_DURABILITY_UNSUPPORTED_WINDOWS' });
  }
  assert.deepEqual(fs.readdirSync(root), ['existing']);
  assert.deepEqual(fs.readdirSync(existing), ['sentinel']);
  assert.equal(fs.readFileSync(path.join(existing, 'sentinel'), 'utf8'), 'unchanged');
  console.log(JSON.stringify({probe:'PRV-11.04', productionAdmission:'denied', diskMutation:false, productionReady:false}));
} finally {
  fs.rmSync(root, {recursive:true,force:true});
}
