// Live page reader for a domain outside the reviewed dataset. Plain HTTP, public pages only.
// Its findings are "declared" at best and always flagged as an automated, unreviewed read.
import type { Connection, Software } from './schema';

const UA = 'chift-benchmark-prototype/0.1 (+public integrations page reader)';
const PATHS = ['/integrations', '/en/integrations', '/integrations/accounting', '/marketplace', '/apps', '/partners', '/connect', '/product/integrations', '/features/integrations'];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function get(url: string) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return { url: res.url, html: await res.text() };
  } catch {
    return null;
  }
}

function textOf(html: string) {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
  const attrs = [...html.matchAll(/(?:alt|title|aria-label)="([^"]{2,80})"/gi)].map((m) => m[1]).join(' | ');
  const raw = `${body} | ${attrs}`.replace(/\s+/g, ' ');
  return { raw, low: norm(raw) };
}

function matcher(software: Software) {
  const names = [software.name, ...software.aliases];
  return names.map((name) =>
    software.cased || name.length <= 4
      ? { cased: true, re: new RegExp(`(^|[^A-Za-z0-9])${esc(name)}([^A-Za-z0-9]|$)`) }
      : { cased: false, re: new RegExp(`(^|[^a-z0-9])${esc(norm(name)).replace(/\s+/g, '[\\s-]?')}([^a-z0-9]|$)`) },
  );
}

export type ScanResult = { domain: string; pageUrl: string | null; pagesTried: number; connections: Connection[]; scannedAt: string };

export async function scanDomain(domain: string, software: Software[]): Promise<ScanResult> {
  const base = `https://${domain}`;
  const scannedAt = new Date().toISOString().slice(0, 10);
  const home = await get(base);
  const candidates = [...PATHS];
  if (home) {
    for (const m of home.html.matchAll(/href="([^"#?]*(?:integration|marketplace|connect|app-store|partner)[^"#?]*)"/gi)) {
      candidates.unshift(m[1]);
    }
  }
  const urls = [...new Set(candidates.map((c) => (c.startsWith('http') ? c : base + (c.startsWith('/') ? c : `/${c}`))))]
    .filter((u) => { try { return new URL(u).hostname.endsWith(domain); } catch { return false; } })
    .slice(0, 12);

  const tests = software.map((s) => ({ s, tests: matcher(s) }));
  let best: { url: string; found: Software[] } | null = null;
  let tried = 0;
  const pages = await Promise.all(urls.map((u) => get(u)));
  for (const page of pages) {
    if (!page) continue;
    tried++;
    const t = textOf(page.html);
    const found = tests.filter((x) => x.tests.some((m) => m.re.test(m.cased ? t.raw : t.low))).map((x) => x.s);
    if (!best || found.length > best.found.length) best = { url: page.url, found };
  }

  const connections: Connection[] = (best?.found ?? []).map((s) => ({
    editorId: 'visitor',
    softwareId: s.id,
    status: 'declared',
    kind: 'unknown',
    viaChift: false,
    sourceUrl: best!.url,
    evidence: `"${s.name}" is named on this page (automated read, not reviewed)`,
    confirmedBy: null,
    collectedAt: scannedAt,
  }));
  return { domain, pageUrl: best && best.found.length ? best.url : null, pagesTried: tried, connections, scannedAt };
}
