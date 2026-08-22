import { clientKey, command, send } from './lib/redis.js';

const sides = new Set(['thailand', 'cambodia']);
const MAX_BATCH = 300;
const MAX_ACTIVE = 1000;

export default async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { error:'method_not_allowed' });
  const sessionId = String(request.headers['x-session-id'] || '');
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return send(response, 400, { error:'invalid_session' });
  const { side, shots } = request.body || {};
  if (!sides.has(side) || !Number.isInteger(shots) || shots < 1 || shots > MAX_BATCH) return send(response, 400, { error:'invalid_payload' });
  try {
    const now = Date.now(); const key = clientKey(request, sessionId);
    const script = `redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',ARGV[1])
      redis.call('ZADD',KEYS[3],ARGV[2],ARGV[3])
      local online=redis.call('ZCARD',KEYS[3])
      if online > tonumber(ARGV[6]) then redis.call('ZREM',KEYS[3],ARGV[3]); return {-2,online} end
      local used=redis.call('INCRBY',KEYS[2],ARGV[4])
      if used == tonumber(ARGV[4]) then redis.call('EXPIRE',KEYS[2],30) end
      if used > tonumber(ARGV[5]) then return {-1,used} end
      local total=redis.call('INCRBY',KEYS[1],ARGV[4])
      return {total,online}`;
    const result = await command(['EVAL', script, '3', `tankwar:score:${side}`, `tankwar:rate:${key}`, 'tankwar:active', String(now-60_000), String(now), key, String(shots), String(MAX_BATCH), String(MAX_ACTIVE)]);
    if (Number(result[0]) === -2) return send(response, 503, { error:'server_full', limit:MAX_ACTIVE });
    if (Number(result[0]) === -1) return send(response, 429, { error:'rate_limited' });
    return send(response, 200, { accepted:shots, side, sideTotal:Number(result[0]), playersOnline:Number(result[1]) });
  } catch (error) {
    return send(response, 503, { error:error.message === 'redis_not_configured' ? 'storage_not_configured' : 'storage_unavailable' });
  }
}

