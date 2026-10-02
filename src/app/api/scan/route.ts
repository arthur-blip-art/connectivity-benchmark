import { NextResponse } from 'next/server';
import { dataset } from '@/lib/data';
import { cleanDomain, findEditor } from '@/lib/benchmark';
import { allow, clientIp } from '@/lib/rate-limit';
import { scanDomain } from '@/lib/scan';
import { store } from '@/lib/store';

// Reads the public integrations page of a domain that is not in the reviewed dataset.
export async function GET(req: Request) {
  if (!allow(`scan:${clientIp(req)}`, 6)) return NextResponse.json({ error: 'Too many page reads. Try again in a minute.' }, { status: 429 });
  const domain = cleanDomain(new URL(req.url).searchParams.get('domain') ?? '');
  // Public hostnames only: no IP literal, no local name.
  const local = /^[\d.]+$/.test(domain) || /(^|\.)(localhost|local|internal|lan)$/.test(domain);
  if (local || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return NextResponse.json({ error: 'Enter a domain such as yourcompany.com.' }, { status: 400 });

  const editor = findEditor(dataset, domain);
  if (editor) return NextResponse.json({ kind: 'editor', editorId: editor.id, domain: editor.domain });

  const cached = store.getScan(domain);
  if (cached) return NextResponse.json({ kind: 'scanned', ...cached.result });

  const result = await scanDomain(domain, dataset.software);
  store.saveScan(domain, result);
  return NextResponse.json({ kind: 'scanned', ...result });
}
