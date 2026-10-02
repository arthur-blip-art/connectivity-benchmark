// Per-IP limit on form posts. In memory: enough for one instance, replace with a shared store behind a load balancer.
const hits = new Map<string, number[]>();

export function allow(ip: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
}
