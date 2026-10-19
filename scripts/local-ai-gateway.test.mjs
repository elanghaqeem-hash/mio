import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMioLocalGateway } from './local-ai-gateway.mjs';

const server = createMioLocalGateway();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const missing = await fetch(base + '/missing');
  assert.equal(missing.status, 404);

  const blockedHost = await fetch(base + '/missing', { headers: { Host: 'evil.example:4318' } });
  assert.equal(blockedHost.status, 403);

  const blocked = await fetch(base + '/v1/chat', {
    method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
  });
  assert.equal(blocked.status, 403);

  const invalid = await fetch(base + '/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(invalid.status, 400);

  const role = await fetch(base + '/v1/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'tool', content: 'unsafe' }] }),
  });
  assert.equal(role.status, 400);

  const large = await fetch(base + '/v1/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'a'.repeat(70000) }] }),
  });
  assert.equal(large.status, 413);
  console.log('MIO gateway negative-path smoke tests passed');
} finally {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
