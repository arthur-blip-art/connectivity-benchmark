#!/usr/bin/env node
// Builds data/measures.json: where companies receive their e-invoices on Peppol, per platform.
// France: figures published by the connect-compta barometer (Chift). Belgium: our own sample (peppol-be.mjs).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const config = read('collector/config.json');
const softwareIdFor = (name) => {
  for (const [id, meta] of Object.entries(config.platformMatch ?? {})) if (new RegExp(meta, 'i').test(name)) return id;
  return null;
};

const measures = [];

if (existsSync(join(ROOT, 'collector/raw/connect-compta-pa.json'))) {
  const fr = read('collector/raw/connect-compta-pa.json');
  measures.push({
    country: 'FR',
    title: 'Measured: where French companies receive e-invoices',
    method: 'Every French company number looked up on the Peppol network, crossed with the SIRENE register. Platform named by its OpenPeppol certificate.',
    source: { label: 'connect-compta barometer, by Chift', url: 'https://www.connect-compta.fr/carte' },
    compiledAt: config.frBarometerCompiledAt,
    base: { label: 'French companies reachable on Peppol', n: fr.total },
    rows: fr.rows.slice(0, 12).map((r) => ({ name: r.key, n: r.count, softwareId: softwareIdFor(r.key) })),
  });
}

if (existsSync(join(ROOT, 'data/peppol-be.json'))) {
  const be = read('data/peppol-be.json');
  measures.push({
    country: 'BE',
    title: 'Measured: where Belgian companies receive e-invoices',
    method: `${be.numbers_drawn.toLocaleString('en-GB')} random valid Belgian company numbers looked up on the Peppol network: ${be.on_peppol.toLocaleString('en-GB')} are registered. For a random ${be.identified} of them, the access point certificate names the platform.`,
    source: { label: 'Our own sample, same method as the connect-compta barometer', url: null },
    compiledAt: be.collected_at,
    base: { label: 'Belgian companies sampled on Peppol', n: be.identified },
    rows: be.by_access_point.slice(0, 12).map((r) => ({ name: r.name, n: r.n, softwareId: softwareIdFor(r.name) })),
  });
}

writeFileSync(join(ROOT, 'data/measures.json'), JSON.stringify(measures, null, 2) + '\n');
console.log(`measures: ${measures.map((m) => `${m.country} (${m.rows.length} platforms, base ${m.base.n})`).join(', ')}`);
