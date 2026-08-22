import { command, send } from './lib/redis.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return send(response, 405, { error:'method_not_allowed' });
  try {
    const now = Date.now();
    const script = `redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', ARGV[1])
      local a=tonumber(redis.call('GET',KEYS[1]) or '0')
      local b=tonumber(redis.call('GET',KEYS[2]) or '0')
      local online=tonumber(redis.call('ZCARD',KEYS[3]) or '0')
      return {a,b,online}`;
    const [thailand, cambodia, playersOnline] = await command(['EVAL', script, '3', 'tankwar:score:thailand', 'tankwar:score:cambodia', 'tankwar:active', String(now - 60_000)]);
    return send(response, 200, { thailand:Number(thailand), cambodia:Number(cambodia), total:Number(thailand)+Number(cambodia), playersOnline:Number(playersOnline), updatedAt:new Date().toISOString() });
  } catch (error) {
    return send(response, 503, { error:error.message === 'redis_not_configured' ? 'storage_not_configured' : 'storage_unavailable' });
  }
}

