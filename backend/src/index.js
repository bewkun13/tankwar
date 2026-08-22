const SIDES = new Set(['thailand', 'myanmar']);
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', ...extra } });

export class ScoreCounter {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/scores') {
      const scores = (await this.state.storage.get('scores')) || { thailand:0, myanmar:0 };
      return json({ ...scores, total:scores.thailand + scores.myanmar });
    }
    if (request.method === 'POST' && url.pathname === '/increment') {
      const { side, shots } = await request.json();
      const scores = (await this.state.storage.get('scores')) || { thailand:0, myanmar:0 };
      scores[side] += shots;
      await this.state.storage.put('scores', scores);
      await this.persist(scores);
      return json({ accepted:shots, scores:{ ...scores, total:scores.thailand + scores.myanmar } });
    }
    return json({ error:'not_found' }, 404);
  }
  async persist(scores) {
    if (!this.env.DB) return;
    await this.env.DB.prepare(`INSERT INTO score_snapshots (id, thailand, myanmar, updated_at)
      VALUES (1, ?, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET thailand=excluded.thailand, myanmar=excluded.myanmar, updated_at=excluded.updated_at`)
      .bind(scores.thailand, scores.myanmar).run();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') || '';
    const allowed = !env.ALLOWED_ORIGIN || origin === env.ALLOWED_ORIGIN;
    const cors = { 'access-control-allow-origin': allowed && origin ? origin : (env.ALLOWED_ORIGIN || '*'), 'access-control-allow-headers':'content-type,x-session-id', 'access-control-allow-methods':'GET,POST,OPTIONS', 'vary':'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors });
    if (!allowed) return json({ error:'origin_not_allowed' }, 403, cors);

    if (request.method === 'GET' && url.pathname === '/api/scores') {
      const counter = env.SCORE_COUNTER.get(env.SCORE_COUNTER.idFromName('global-v1'));
      const response = await counter.fetch('https://counter/scores');
      const body = await response.text();
      return new Response(body, { status:response.status, headers:{ ...cors, 'content-type':'application/json', 'cache-control':'public, max-age=3, s-maxage=3' } });
    }
    if (request.method === 'POST' && url.pathname === '/api/shots') {
      const type = request.headers.get('content-type') || '';
      if (!type.includes('application/json')) return json({ error:'content_type_must_be_json' }, 415, cors);
      const length = Number(request.headers.get('content-length') || 0);
      if (length > 1024) return json({ error:'payload_too_large' }, 413, cors);
      const sessionId = request.headers.get('x-session-id') || '';
      if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error:'invalid_session' }, 400, cors);
      let payload;
      try { payload = await request.json(); } catch { return json({ error:'invalid_json' }, 400, cors); }
      if (!payload || !SIDES.has(payload.side) || !Number.isInteger(payload.shots) || payload.shots <= 0 || payload.shots > Number(env.MAX_BATCH_SHOTS || 300)) {
        return json({ error:'invalid_payload', detail:'side must be thailand|myanmar; shots must be an integer within the allowed batch limit' }, 400, cors);
      }
      const ip = request.headers.get('cf-connecting-ip') || 'local';
      const key = await sha256(`${ip}:${sessionId}`);
      const limiter = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(key));
      const limited = await limiter.fetch('https://limiter/check', { method:'POST', body:JSON.stringify({ shots:payload.shots, window:Number(env.RATE_WINDOW_SECONDS || 30), max:Number(env.MAX_BATCH_SHOTS || 300) }) });
      if (!limited.ok) return json({ error:'rate_limited' }, 429, { ...cors, 'retry-after':'30' });
      const counter = env.SCORE_COUNTER.get(env.SCORE_COUNTER.idFromName('global-v1'));
      const response = await counter.fetch('https://counter/increment', { method:'POST', body:JSON.stringify(payload) });
      return new Response(await response.text(), { status:response.status, headers:{ ...cors, 'content-type':'application/json' } });
    }
    if (url.pathname === '/health') return json({ ok:true }, 200, cors);
    return json({ error:'not_found' }, 404, cors);
  }
};

export class RateLimiter {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const { shots, window, max } = await request.json();
    const now = Date.now();
    let bucket = (await this.state.storage.get('bucket')) || { start:now, shots:0, requests:0 };
    if (now - bucket.start >= window * 1000) bucket = { start:now, shots:0, requests:0 };
    bucket.shots += shots; bucket.requests += 1;
    await this.state.storage.put('bucket', bucket);
    return bucket.shots <= max && bucket.requests <= 3 ? json({ ok:true }) : json({ error:'rate_limited' }, 429);
  }
}
async function sha256(value) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,'0')).join(''); }

