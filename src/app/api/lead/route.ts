import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CountryCode } from '@/lib/schema';
import { LeadError, processLead } from '@/lib/pipeline';
import { allow, clientIp } from '@/lib/rate-limit';
import { store } from '@/lib/store';

const Body = z.object({
  email: z.string().max(200),
  role: z.string().max(120),
  consent: z.boolean(),
  category: z.string().max(40),
  countries: z.array(CountryCode),
  domain: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  if (!allow(clientIp(req))) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'The form is incomplete.' }, { status: 400 });
  try {
    const out = await processLead({ ...parsed.data, origin: new URL(req.url).origin });
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof LeadError) return NextResponse.json({ error: e.message, field: e.field }, { status: 422 });
    console.error(e);
    return NextResponse.json({ error: 'Something went wrong on our side. Your request was not saved.' }, { status: 500 });
  }
}

// Deletion on request (GDPR): removes the lead and every message prepared for it.
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !store.getLead(id)) return NextResponse.json({ error: 'Unknown lead.' }, { status: 404 });
  store.deleteLead(id);
  return NextResponse.json({ deleted: true });
}
