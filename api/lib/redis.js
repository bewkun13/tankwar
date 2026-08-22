import { createHash } from 'node:crypto';

const redisUrl = () => process.env.UPSTASH_REDIS_REST_URL
  || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL
  || process.env.KV_REST_API_URL;
const redisToken = () => process.env.UPSTASH_REDIS_REST_TOKEN
  || process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN
  || process.env.KV_REST_API_TOKEN;

export async function command(args) {
  const url = redisUrl(); const token = redisToken();
  if (!url || !token) throw new Error('redis_not_configured');
  const response = await fetch(url, { method:'POST', headers:{ authorization:`Bearer ${token}`, 'content-type':'application/json' }, body:JSON.stringify(args) });
  if (!response.ok) throw new Error(`redis_${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

export function clientKey(request, sessionId) {
  const forwarded = request.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  return createHash('sha256').update(`${ip}:${sessionId}`).digest('hex');
}

export function send(response, status, body) {
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.status(status).json(body);
}

