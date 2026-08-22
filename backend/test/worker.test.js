import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const env = { ALLOWED_ORIGIN:'https://game.test', MAX_BATCH_SHOTS:'300', RATE_WINDOW_SECONDS:'30' };
test('rejects disallowed origin before bindings are used', async () => {
  const res = await worker.fetch(new Request('https://api.test/api/scores', { headers:{ origin:'https://evil.test' } }), env);
  assert.equal(res.status, 403);
});
test('rejects invalid session before bindings are used', async () => {
  const res = await worker.fetch(new Request('https://api.test/api/shots', { method:'POST', headers:{ origin:'https://game.test','content-type':'application/json','x-session-id':'bad' }, body:'{"side":"thailand","shots":1}' }), env);
  assert.equal(res.status, 400); assert.equal((await res.json()).error, 'invalid_session');
});
test('rejects invalid shots before bindings are used', async () => {
  const res = await worker.fetch(new Request('https://api.test/api/shots', { method:'POST', headers:{ origin:'https://game.test','content-type':'application/json','x-session-id':'11111111-1111-4111-8111-111111111111' }, body:'{"side":"thailand","shots":0}' }), env);
  assert.equal(res.status, 400);
});

