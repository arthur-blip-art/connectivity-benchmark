import { NextResponse } from 'next/server';
import { z } from 'zod';
import { allow, clientIp } from '@/lib/rate-limit';
import { store } from '@/lib/store';

const Body = z.object({
  editorId: z.string().max(80),
  softwareId: z.string().max(80),
  message: z.string().min(3).max(1000),
  email: z.string().max(200).optional(),
});

// A correction from a vendor is data quality and an interest signal at once.
export async function POST(req: Request) {
  if (!allow(clientIp(req))) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tell us what is wrong in a few words.' }, { status: 400 });
  store.addCorrection({ ...parsed.data, email: parsed.data.email || null });
  return NextResponse.json({ ok: true });
}
