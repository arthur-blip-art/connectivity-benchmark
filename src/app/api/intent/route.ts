import { NextResponse } from 'next/server';
import { z } from 'zod';
import { registerExpertClick } from '@/lib/pipeline';
import { allow, clientIp } from '@/lib/rate-limit';

const Body = z.object({ leadId: z.string().uuid() });

export async function POST(req: Request) {
  if (!allow(clientIp(req), 30)) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  await registerExpertClick(parsed.data.leadId, new URL(req.url).origin);
  return NextResponse.json({ ok: true, bookingUrl: process.env.BOOKING_URL ?? 'https://www.chift.eu/contact' });
}
