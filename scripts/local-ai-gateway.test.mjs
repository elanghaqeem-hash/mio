import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createMioLocalGateway } from './local-ai-gateway.mjs';

const server = createMioLocalGateway();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const missing = await fetch(base + '/missing');
  assert.equal(missing.status, 404);

  const missingHost = await new Promise((resolve, reject) => {
    const request = http.request(base + '/missing', { setHost: false }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.end();
  });
  assert.equal(missingHost, 400);

  const blockedHost = await new Promise((resolve, reject) => {
    http.get(base + '/missing', { headers: { host: 'evil.example:4318' } }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    }).on('error', reject);
  });
  assert.equal(blockedHost, 403);

  const wrongPortHost = await new Promise((resolve, reject) => {
    http.get(base + '/missing', { headers: { host: '127.0.0.1:99999' } }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    }).on('error', reject);
  });
  assert.equal(wrongPortHost, 403);

  const preflightMissingOrigin = await fetch(base + '/v1/chat', { method: 'OPTIONS' });
  assert.equal(preflightMissingOrigin.status, 403);

  const preflightAllowed = await fetch(base + '/v1/chat', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(preflightAllowed.status, 204);
  assert.equal(preflightAllowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');

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
