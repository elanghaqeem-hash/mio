import assert from 'node:assert/strict';
import { MioLocalProvider } from '../src/intelligence/model/MioLocalProvider';

async function main() {
  const realFetch = globalThis.fetch;
  const requests: string[] = [];
  const provider = new MioLocalProvider({
    backend: 'gateway',
    endpoint: 'http://127.0.0.1:4318',
    model: 'qwen2.5:3b',
    enableWebSearch: false,
    enableBrowserRead: false,
  });
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push(url);
      assert.equal(url, 'http://127.0.0.1:4318/v1/chat', 'offline mode must never send requests to cloud or research tools');
      const body = JSON.parse(String(init?.body));
      assert.ok(body.messages.some((m: { role: string; content: string }) => m.role === 'user' && m.content === 'Offline halo'));
      return new Response(JSON.stringify({
        provider: 'local-ollama',
        model: 'qwen2.5:3b',
        message: { role: 'assistant', content: 'Halo offline!' },
        done: true,
      }), { status: 200 });
    };
    const response = await provider.generate({ messages: [{ role: 'user', content: 'Offline halo' }] });
    assert.ok(JSON.stringify(response).includes('Halo offline!'));
    assert.ok(requests.length >= 1);
    assert.ok(requests.every(url => url.startsWith('http://127.0.0.1:4318/')));
    console.log('MIO local-only routing contract passed: no external inference requests');
  } finally {
    globalThis.fetch = realFetch;
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
