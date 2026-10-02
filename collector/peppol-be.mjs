#!/usr/bin/env node
// Peppol barometer for Belgium, same method as connect-compta.fr for France:
// SML DNS lookup per company number, then the access point's OpenPeppol certificate.
//
// Step 1 (sample):  draw random valid Belgian enterprise numbers (KBO/BCE, scheme 0208),
//                   resolve each on the Peppol SML. A hit gives the SMP that hosts the company.
// Step 2 (identify): for a sub-sample of hits, read the SMP record and the access point
//                   certificate, whose subject names the service provider.
//
// Usage: node collector/peppol-be.mjs sample --n 40000
//        node collector/peppol-be.mjs identify --max 600
// Output: collector/raw/peppol-be-hits.jsonl, collector/raw/peppol-be-identified.jsonl,
//         data/peppol-be.json (aggregated)

import { Resolver } from 'node:dns/promises';
import { createHash, X509Certificate } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'collector', 'raw');
const HITS = join(RAW, 'peppol-be-hits.jsonl');
const IDENT = join(RAW, 'peppol-be-identified.jsonl');
const OUT = join(ROOT, 'data', 'peppol-be.json');
const SML = 'iso6523-actorid-upis.edelivery.tech.ec.europa.eu';
const UA = 'chift-benchmark-prototype/0.1 (research sample; contact arthur@ordalia.online)';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : Number(args[i + 1]);
};

const base32 = (buf) => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
};

const smlName = (participant) =>
  `${base32(createHash('sha256').update(participant.toLowerCase()).digest())}.${SML}`;

// Belgian enterprise number: 8 digits + 2 check digits, check = 97 - (first8 mod 97).
function randomEnterpriseNumber() {
  const first8 = 2_000_000 + Math.floor(Math.random() * 8_400_000); // 0200.000.0 to 1039.999.9
  const check = 97 - (first8 % 97);
  return String(first8).padStart(8, '0') + String(check).padStart(2, '0');
}

const readJsonl = (file) =>
  existsSync(file)
    ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

async function sample() {
  const n = flag('n', 5000);
  mkdirSync(RAW, { recursive: true });
  const resolvers = ['1.1.1.1', '8.8.8.8', '9.9.9.9'].map((ip) => {
    const r = new Resolver({ timeout: 4000, tries: 2 });
    r.setServers([ip]);
    return r;
  });
  const numbers = Array.from({ length: n }, randomEnterpriseNumber);
  let done = 0, hits = 0, errors = 0;
  await pool(numbers, 20, async (num) => {
    const resolver = resolvers[done % resolvers.length];
    try {
      const records = await resolver.resolveNaptr(smlName(`0208:${num}`));
      const smp = records.map((r) => /!(https?:\/\/[^!]+)!/.exec(r.regexp)?.[1]).find(Boolean);
      if (smp) {
        hits++;
        appendFileSync(HITS, JSON.stringify({ num, smp, at: new Date().toISOString().slice(0, 10) }) + '\n');
      }
    } catch (e) {
      if (!['ENOTFOUND', 'ENODATA'].includes(e.code)) errors++;
    }
    if (++done % 2000 === 0) console.log(`${done}/${n} looked up, ${hits} on Peppol, ${errors} errors`);
  });
  appendFileSync(join(RAW, 'peppol-be-runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), n, hits, errors }) + '\n');
  console.log(`done: ${n} numbers, ${hits} on Peppol, ${errors} lookup errors`);
}

const lastCall = new Map();
async function politeFetch(url) {
  const host = new URL(url).host;
  const wait = (lastCall.get(host) ?? 0) + 600 - Date.now();
  lastCall.set(host, Date.now() + Math.max(wait, 0));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function identifyOne({ num, smp }) {
  const base = smp.endsWith('/') ? smp : smp + '/';
  const id = encodeURIComponent(`iso6523-actorid-upis::0208:${num}`);
  const group = await politeFetch(base + id);
  const refs = [...group.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const ref = refs.find((h) => /invoice/i.test(decodeURIComponent(h))) ?? refs[0];
  if (!ref) return { num, smp, error: 'no service' };
  const meta = await politeFetch(ref);
  const cert = /<(?:\w+:)?Certificate>([^<]+)</.exec(meta)?.[1]?.replace(/\s+/g, '');
  const endpoint = /<(?:\w+:)?(?:EndpointURI|Address)>([^<]+)</.exec(meta)?.[1];
  if (!cert) return { num, smp, endpoint, error: 'no certificate' };
  const subject = new X509Certificate(Buffer.from(cert, 'base64')).subject;
  const field = (k) => new RegExp(`^${k}=(.+)$`, 'm').exec(subject)?.[1];
  return { num, smp, endpoint, org: field('O'), cn: field('CN'), country: field('C') };
}

async function identify() {
  const max = flag('max', 600);
  const hits = readJsonl(HITS);
  const seen = new Set(readJsonl(IDENT).map((r) => r.num));
  const todo = hits
    .filter((h) => !seen.has(h.num))
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.max(0, max - seen.size));
  console.log(`${hits.length} hits, ${seen.size} already identified, ${todo.length} to do`);
  let done = 0;
  await pool(todo, 6, async (hit) => {
    let row;
    try {
      row = await identifyOne(hit);
    } catch (e) {
      row = { ...hit, error: String(e.message ?? e) };
    }
    appendFileSync(IDENT, JSON.stringify(row) + '\n');
    if (++done % 50 === 0) console.log(`${done}/${todo.length}`);
  });
  aggregate();
}

function aggregate() {
  const hits = readJsonl(HITS);
  const rows = readJsonl(IDENT);
  const runs = readJsonl(join(RAW, 'peppol-be-runs.jsonl'));
  const ok = rows.filter((r) => r.org);
  const count = (list, key) => {
    const m = new Map();
    for (const r of list) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  };
  const out = {
    collected_at: new Date().toISOString().slice(0, 10),
    method:
      'Random valid Belgian enterprise numbers (scheme 0208) resolved on the Peppol SML by DNS; ' +
      'for a random sub-sample, the access point certificate (OpenPeppol) names the service provider.',
    numbers_drawn: runs.reduce((s, r) => s + r.n, 0),
    on_peppol: hits.length,
    identified: ok.length,
    not_identified: rows.length - ok.length,
    by_smp_host: count(hits, (h) => new URL(h.smp).host),
    by_access_point: count(ok, (r) => r.org),
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`wrote ${OUT}`);
  console.log(out.by_access_point.slice(0, 15));
}

if (cmd === 'sample') await sample();
else if (cmd === 'identify') await identify();
else if (cmd === 'aggregate') aggregate();
else console.log('usage: peppol-be.mjs sample --n 40000 | identify --max 600 | aggregate');
