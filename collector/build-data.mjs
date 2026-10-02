#!/usr/bin/env node
// Turns the raw collection (collector/raw/*.json) into the reference data the site reads (data/*.json),
// and writes collector/review.csv: one line per vendor × software, for the human review.
//
//   node collector/build-data.mjs
//
// Three sources of connections, merged per vendor × software:
//   1. vendors' own public pages          (raw/editors-*.json)      -> "declared"
//   2. accounting software marketplaces   (raw/marketplaces.json)   -> "confirmed"
//   3. connect-compta, Chift's directory  (raw/connect-compta-annuaire.json, France) -> "directory"
//
// Review loop: read review.csv next to the sources, then put any correction in collector/overrides.csv
// (editor_id,software_id,status,kind,source_url,evidence ; status "remove" deletes a connection) and run again.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'collector', 'raw');
const DATA = join(ROOT, 'data');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const write = (name, value) => writeFileSync(join(DATA, name), JSON.stringify(value, null, 2) + '\n');
const http = (v) => (typeof v === 'string' && /^https?:\/\//.test(v) ? v : null);
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cleanDomain = (s) => (s ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const config = read(join(ROOT, 'collector', 'config.json'));
const COUNTRY_NAMES = {
  FR: 'France', DE: 'Germany', BE: 'Belgium', NL: 'Netherlands', GB: 'United Kingdom',
  ES: 'Spain', IT: 'Italy', DK: 'Denmark', SE: 'Sweden', NO: 'Norway',
};
const iso = (code) => (code === 'UK' ? 'GB' : code);

// --- Markets: Chift's white paper is the reference for the ten countries ------------------------
// collector/whitepaper.json holds, per country, the tools cited by respondents in chart order and a level.
// The files collected on the web (raw/market*.json) add official sources, product links and vendor figures.
const whitepaper = read(join(ROOT, 'collector', 'whitepaper.json'));
const webByCountry = {};
for (const file of readdirSync(RAW).filter((f) => /^market(-[a-z-]+)?\.json$/.test(f)).sort()) {
  for (const [code, c] of Object.entries(read(join(RAW, file)).countries ?? {})) webByCountry[iso(code)] = c;
}
const COUNTRIES = Object.keys(COUNTRY_NAMES).filter((code) => whitepaper.countries[code]);

const software = [];
const markets = [];
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4]}`;
const addSoftware = (code, s) => {
  const meta = config.software[s.id];
  if (!meta) throw new Error(`no matcher for software "${s.id}" in collector/config.json`);
  if (!software.some((x) => x.id === s.id)) {
    software.push({ id: s.id, name: s.name, vendor: s.vendor, target: s.target, url: http(s.url), marketplaceUrl: http(s.marketplaceUrl), aliases: meta.aliases ?? [], cased: meta.cased ?? s.name.length <= 4 });
  }
  markets.push({ country: code, softwareId: s.id, importance: s.importance, evidence: s.evidence, sources: s.sources });
};
for (const code of COUNTRIES) {
  const wp = whitepaper.countries[code];
  const web = webByCountry[code]?.software ?? [];
  wp.software.forEach(([id, name, vendor, target, importance, note, rankOverride], i) => {
    const found = web.find((w) => w.id === id || w.name?.toLowerCase() === name.toLowerCase());
    const ranked = !(wp.unranked ?? []).includes(id);
    const rank = rankOverride ?? i + 1;
    const evidence = [
      ranked ? `${ordinal(rank)} of the ${wp.cited} tools cited by respondents in Chift's 2026 survey (${wp.respondents} respondents in ${COUNTRY_NAMES[code]}).` : '',
      note,
    ].filter(Boolean).join(' ');
    addSoftware(code, {
      id, name, vendor, target, importance, evidence, url: found?.url, marketplaceUrl: found?.marketplace_url,
      sources: [whitepaper.source.url, ...(found?.sources ?? []).filter(http).slice(0, 2)],
    });
  });
  for (const s of config.extraSoftware?.[code] ?? []) addSoftware(code, { ...s, marketplaceUrl: null });
}

// Names are tried in the order of collector/config.json: the most specific product first.
const matchers = Object.entries(config.software).map(([id, meta]) => [id, new RegExp(meta.match, meta.cased ? '' : 'i')]);
const softwareIdFor = (raw) => matchers.find(([, re]) => re.test(raw))?.[0] ?? null;
// A page that only says "Sage" or "Cegid" may mean any product of the family, depending on where the vendor sells.
const familyFor = (raw, hq) => {
  const family = Object.values(config.families).find((f) => new RegExp(f.match, 'i').test(raw.trim()));
  return family ? family.membersByHq?.[hq] ?? family.members : null;
};

// --- Vendors and declared connections ----------------------------------------------------------
// When a vendor states several ways to reach a software, keep the strongest. A named file export beats an unstated type.
const KIND_RANK = { api: 4, via_partner: 3, file_export: 2, unknown: 1 };
const editors = [];
const connections = new Map(); // key editor|software
const unmapped = [];
const comingSoon = [];
// A row naming the product replaces a row that only names the brand, at equal strength.
const put = (c, fromFamily = false) => {
  const key = `${c.editorId}|${c.softwareId}`;
  const prev = connections.get(key);
  const better = !prev || KIND_RANK[c.kind] > KIND_RANK[prev.kind] || (KIND_RANK[c.kind] === KIND_RANK[prev.kind] && prev.fromFamily && !fromFamily);
  if (better) connections.set(key, { ...c, fromFamily });
};

// One connection as a vendor's page states it: mapped to a software, or to every product of a named family.
const addDeclared = (id, hq, c, collectedAt) => {
  if (c.kind === 'coming_soon') { comingSoon.push(`${id}: ${c.software_raw}`); return; }
  if (!http(c.source_url) || !KIND_RANK[c.kind]) return;
  const base = {
    editorId: id, status: 'declared', kind: c.kind, viaChift: /\bchift\b/i.test(c.evidence ?? ''), sourceUrl: c.source_url,
    confirmedBy: null, collectedAt: collectedAt ?? config.collectedAt,
  };
    const softwareId = softwareIdFor(c.software_raw);
    if (softwareId) { put({ ...base, softwareId, evidence: c.evidence }); return; }
    // A family name ("Sage") reads as the products of the country the page is written for, else of the vendor's HQ.
    const members = familyFor(c.software_raw, c.countries_stated?.length === 1 ? iso(c.countries_stated[0]) : iso(hq ?? '--'));
    if (members?.length) {
      for (const member of members) {
        put({ ...base, softwareId: member, kind: c.kind === 'api' ? 'unknown' : c.kind, evidence: `Page names "${c.software_raw}" without the product. ${c.evidence}` }, true);
      }
      return;
    }
    unmapped.push(`${id}: ${c.software_raw}`);
};

for (const file of readdirSync(RAW).filter((f) => /^editors-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(8)) - parseInt(b.slice(8)))) {
  const batch = read(join(RAW, file));
  for (const e of batch.editors) {
    const id = slug(e.id || e.name);
    if (config.excludedEditors[id] || editors.some((x) => x.id === id)) continue;
    editors.push({
      id, name: e.name, domain: cleanDomain(e.domain), category: config.editorCategory[id] ?? config.batchCategory[file] ?? 'vertical',
      hq: iso(e.hq_country ?? '--'), integrationsUrl: http(e.integrations_url), inDirectory: false, collected: true,
      unreadable: (e.pages_unreadable ?? [])
        .filter((p) => p.url && !config.ignoreUnreadable.some((x) => p.url.includes(x)))
        .map((p) => ({ url: p.url, reason: /403|anti-bot|cloudflare|challenge/i.test(p.reason) ? 'refuses automated reading' : p.reason })),
    });
    for (const c of e.connections ?? []) addDeclared(id, e.hq_country, c, batch.collected_at);
  }
}

// --- Pages read in a browser ----------------------------------------------------------------------
// raw/browser-reads.json: vendors whose pages refused automated reading, re-read later as a normal visitor.
if (existsSync(join(RAW, 'browser-reads.json'))) {
  const reads = read(join(RAW, 'browser-reads.json'));
  for (const v of reads.vendors ?? []) {
    const editor = editors.find((e) => e.id === v.editorId);
    if (!editor) continue;
    const readNow = new Set(v.pages_read ?? []);
    editor.unreadable = editor.unreadable.filter((u) => !readNow.has(u.url));
    for (const c of v.connections ?? []) addDeclared(editor.id, editor.hq, c, reads.collected_at);
  }
}

// --- Marketplace confirmations -----------------------------------------------------------------
const marketplaces = existsSync(join(RAW, 'marketplaces.json')) ? read(join(RAW, 'marketplaces.json')) : { marketplaces: [] };
const editorByName = (name) => editors.find((e) => e.name.toLowerCase() === name.toLowerCase() || e.id === slug(name));
const unreadableMarketplaces = [];
for (const m of marketplaces.marketplaces) {
  if (config.skipMarketplaces[m.software]) {
    unreadableMarketplaces.push({ software: m.software, reason: config.skipMarketplaces[m.software] });
    continue;
  }
  if (!m.readable) {
    unreadableMarketplaces.push({ software: m.software, reason: config.unreadableReasons[m.software] ?? m.reason });
    continue;
  }
  const ids = config.marketplaceTargets[m.software] ?? (softwareIdFor(m.software) ? [softwareIdFor(m.software)] : []);
  for (const listed of m.editors_listed ?? []) {
    const editor = editorByName(listed.editor);
    if (!editor) continue;
    if (config.skipListings.some((x) => x.software === m.software && x.editor === listed.editor)) continue;
    for (const id of ids) {
      const key = `${editor.id}|${id}`;
      const prev = connections.get(key);
      connections.set(key, prev
        ? { ...prev, status: 'confirmed', confirmedBy: listed.listing_url }
        : { editorId: editor.id, softwareId: id, status: 'confirmed', kind: 'unknown', viaChift: false, sourceUrl: listed.listing_url, evidence: `Listed by the accounting software: ${listed.evidence}`, confirmedBy: listed.listing_url, collectedAt: marketplaces.collected_at });
    }
  }
}

// --- connect-compta, Chift's public directory for France ---------------------------------------
const directoryFile = join(RAW, 'connect-compta-annuaire.json');
const directoryStats = { tools: 0, connections: 0, merged: 0 };
if (existsSync(directoryFile)) {
  const directory = read(directoryFile);
  const TYPE = {
    direct: { kind: 'api', text: 'a direct connection' },
    chift: { kind: 'via_partner', text: 'a connection through Chift' },
    integre: { kind: 'api', text: 'a built-in connection (same vendor)' },
  };
  const entries = [
    ...directory.tools.map((t) => ({ ...t, category: config.directoryCategory[t.name] ?? 'invoicing' })),
    ...directory.caisses.map((t) => ({ ...t, category: 'pos' })),
  ].filter((t) => !config.directorySkip.includes(t.name));
  for (const t of entries) {
    const domain = cleanDomain(t.site).includes('.') && !/\//.test(t.site.replace(/^https?:\/\//, '').replace(/\/$/, '')) ? cleanDomain(t.site) : '';
    // The same vendor may be named differently in the directory ("SumUp POS") and on its own site ("SumUp").
    const alias = config.directoryAlias?.[t.name];
    let editor = editors.find((e) => (alias && e.id === alias) || (domain && e.domain === domain) || e.name.toLowerCase() === t.name.toLowerCase() || e.id === slug(t.name));
    if (editor) directoryStats.merged++;
    else {
      editor = { id: slug(t.name), name: t.name.replace(/ \(POS\)$/, ''), domain, category: t.category, hq: '--', integrationsUrl: null, inDirectory: true, collected: false, unreadable: [] };
      if (editors.some((e) => e.id === editor.id)) continue;
      editors.push(editor);
    }
    editor.inDirectory = true;
    directoryStats.tools++;
    for (const [softwareKey, type] of Object.entries(t.conns)) {
      const softwareId = software.find((s) => s.id === softwareKey.toLowerCase())?.id;
      if (!softwareId || !TYPE[type]) continue;
      directoryStats.connections++;
      const key = `${editor.id}|${softwareId}`;
      const prev = connections.get(key);
      const row = {
        editorId: editor.id, softwareId, status: 'directory', kind: TYPE[type].kind, viaChift: type === 'chift',
        sourceUrl: config.directoryUrl, evidence: `connect-compta, Chift's directory, lists ${TYPE[type].text}.`,
        confirmedBy: config.directoryUrl, collectedAt: config.collectedAt,
      };
      connections.set(key, prev
        ? { ...prev, status: prev.status === 'confirmed' ? 'confirmed' : 'directory', kind: KIND_RANK[row.kind] > KIND_RANK[prev.kind] ? row.kind : prev.kind,
            viaChift: prev.viaChift || row.viaChift, confirmedBy: prev.confirmedBy ?? config.directoryUrl,
            evidence: `${prev.evidence.replace(/[.\s]*$/, '')}. Also listed in connect-compta (${TYPE[type].text.replace(/^an? /, '')}).` }
        : row);
    }
  }
}

// --- Second pass: every vendor-sourced connection re-read at its source ------------------------
// raw/verification-N.json holds one verdict per connection. A line the page does not support is dropped
// (a directory listing keeps standing on its own source); a wrong type is corrected.
const review = { read: 78, held: 72, removed: 4, corrected: 2 }; // first pass, applied through overrides.csv
// Keys re-read at their source, first pass included, so the page can say exactly how many are left.
const reread = new Set((read(join(RAW, 'verification.json')).rows ?? []).filter((v) => v.verdict !== 'unreadable').map((v) => `${v.editorId}|${v.softwareId}`));
for (const file of readdirSync(RAW).filter((f) => /^verification-\d+\.json$/.test(f)).sort()) {
  for (const v of read(join(RAW, file)).rows ?? []) {
    const key = `${v.editorId}|${v.softwareId}`;
    const prev = connections.get(key);
    // A page we could not read proves nothing either way: the line stays, counted as not re-read.
    if (!prev || prev.sourceUrl === config.directoryUrl || v.verdict === 'unreadable') continue;
    review.read++;
    reread.add(key);
    if (v.verdict === 'ok' || v.verdict === 'ok_family') { review.held++; continue; }
    if (v.verdict === 'wrong_kind' && KIND_RANK[v.suggested_kind]) {
      connections.set(key, { ...prev, kind: v.suggested_kind, viaChift: prev.viaChift && (prev.status === 'directory' || v.suggested_kind === 'via_partner') });
      review.corrected++;
      continue;
    }
    review.removed++;
    if (prev.status === 'directory') {
      connections.set(key, { ...prev, sourceUrl: config.directoryUrl, kind: prev.viaChift ? 'via_partner' : 'api', evidence: "connect-compta, Chift's directory, lists this connection." });
    } else if (prev.status === 'confirmed' && prev.confirmedBy) {
      connections.set(key, { ...prev, sourceUrl: prev.confirmedBy, kind: 'unknown', evidence: 'Listed by the accounting software on its marketplace.' });
    } else connections.delete(key);
  }
}

// --- Human overrides ---------------------------------------------------------------------------
const overridesFile = join(ROOT, 'collector', 'overrides.csv');
let overrides = 0;
if (existsSync(overridesFile)) {
  for (const line of readFileSync(overridesFile, 'utf8').split('\n').slice(1).filter((l) => l.trim() && !l.startsWith('#'))) {
    const [editorId, softwareId, status, kind, sourceUrl, ...rest] = line.split(',');
    const key = `${editorId}|${softwareId}`;
    overrides++;
    reread.add(key);
    const prev = connections.get(key);
    // An override corrects what the vendor's page says. A directory listing stands on its own source.
    if (status === 'remove') {
      if (prev?.status === 'directory' && prev.sourceUrl !== config.directoryUrl) {
        connections.set(key, { ...prev, sourceUrl: config.directoryUrl, evidence: prev.evidence.replace(/^.*Also listed in connect-compta \((.*)\)\.$/, "connect-compta, Chift's directory, lists a $1.") });
      } else if (prev?.status !== 'directory') connections.delete(key);
      continue;
    }
    connections.set(key, {
      editorId, softwareId, status: prev?.status === 'directory' && status === 'declared' ? 'directory' : status,
      kind: kind || prev?.kind || 'unknown', viaChift: prev?.viaChift ?? false, sourceUrl: sourceUrl || prev?.sourceUrl,
      evidence: rest.join(',').replace(/^"|"$/g, '') || prev?.evidence || 'Corrected by hand.',
      confirmedBy: status === 'confirmed' ? (prev?.confirmedBy ?? sourceUrl) : (prev?.confirmedBy ?? null), collectedAt: config.collectedAt,
    });
  }
}

const marketIds = new Set(markets.map((m) => m.softwareId));
const kept = [...connections.values()]
  .filter((c) => marketIds.has(c.softwareId) && editors.some((e) => e.id === c.editorId))
  .map(({ fromFamily, ...c }) => c)
  .sort((a, b) => (a.editorId + a.softwareId).localeCompare(b.editorId + b.softwareId));

// --- Where each vendor counts as a competitor --------------------------------------------------
// A vendor we collected ourselves is active where it reaches at least one software that is local to the country
// (present in three markets at most: Microsoft Dynamics or Unit4 say nothing about where a vendor sells), and at home.
// A vendor known only through the French directory is counted in France only.
const reach = (softwareId) => markets.filter((m) => m.softwareId === softwareId).length;
for (const e of editors) {
  const active = new Set();
  if (e.collected) {
    for (const c of kept) {
      if (c.editorId !== e.id || reach(c.softwareId) > 3) continue;
      for (const m of markets) if (m.softwareId === c.softwareId) active.add(m.country);
    }
  }
  if (COUNTRIES.includes(e.hq)) active.add(e.hq);
  if (e.inDirectory) active.add('FR');
  e.markets = COUNTRIES.filter((code) => active.has(code));
}

// --- Countries ---------------------------------------------------------------------------------
const measures = existsSync(join(DATA, 'measures.json')) ? read(join(DATA, 'measures.json')) : [];
const countries = COUNTRIES.map((code) => {
  const wp = whitepaper.countries[code];
  const web = webByCountry[code];
  const display = config.display[code] ?? wp.display;
  const kinds = [{ kind: 'survey', label: `Chift survey 2026 (${wp.respondents} respondents)`, url: whitepaper.source.url }];
  if (web) kinds.push({ kind: 'vendor-figures', label: 'Customer figures published by the vendors', url: null });
  if (code === 'FR') kinds.push({ kind: 'directory', label: 'connect-compta directory, by Chift', url: config.directoryUrl });
  const measure = measures.find((m) => m.country === code);
  if (measure) kinds.push({ kind: 'peppol-measure', label: 'Peppol measure', url: measure.source.url });
  return {
    code, name: COUNTRY_NAMES[code],
    channel: { value: wp.channel ?? web?.channel?.value ?? 'accountant', explanation: display.channel, sources: [whitepaper.source.url, ...(web?.channel?.sources ?? []).filter(http)] },
    reform: {
      summary: display.reform, network: display.network,
      milestones: (web?.reform?.milestones ?? []).filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.date)),
      sources: [whitepaper.source.url, ...(web?.reform?.sources ?? []).filter(http)],
    },
    note: display.note ? { text: display.note, sources: [whitepaper.source.url] } : null,
    evidenceKinds: kinds,
  };
});

write('editors.json', editors.map(({ inDirectory, collected, ...e }) => e));
write('software.json', software);
write('markets.json', markets);
write('connections.json', kept);
write('countries.json', countries);

const settings = read(join(DATA, 'settings.json'));
delete settings.category;
const used = new Set(editors.map((e) => e.category));
const unread = kept.filter((c) => c.sourceUrl !== config.directoryUrl && !reread.has(`${c.editorId}|${c.softwareId}`)).length;
write('settings.json', {
  ...settings,
  categories: config.categories.filter((c) => used.has(c.id)),
  reviewNote:
    `A second automated pass re-read ${review.read} vendor-sourced connections at their source: ${review.held} held, ` +
    `${review.removed} were removed, ${review.corrected} were corrected.` +
    (unread > 0 ? ` ${unread} more are not re-read yet.` : '') +
    ' connect-compta listings are taken as Chift publishes them. Review by a person: pending.',
});

// --- Enrichment fixture (simulated provider): public headcount estimates, each with its source ---
if (existsSync(join(RAW, 'headcounts.json'))) {
  write('enrichment-fixture.json', read(join(RAW, 'headcounts.json')).map((h) => ({
    domain: h.domain, name: h.name, employees: h.employees ?? null, industry: h.industry ?? null, hq: h.hq ?? null,
    source: `simulated enrichment, public estimate${h.range ? ` (${h.range})` : ''}, ${h.source_year ?? ''} ${h.source_url && h.source_url !== 'not_found' ? new URL(h.source_url).hostname : ''}`.trim(),
  })));
}

// --- Review sheet ------------------------------------------------------------------------------
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const lines = ['country,category,editor,software,importance,status,kind,via_chift,source_url,confirmed_by,evidence'];
for (const m of markets) {
  for (const e of editors.filter((x) => x.markets.includes(m.country))) {
    const c = connections.get(`${e.id}|${m.softwareId}`);
    lines.push([m.country, e.category, e.id, m.softwareId, m.importance, c?.status ?? 'not_found', c?.kind ?? '', c?.viaChift ? 'yes' : '', c?.sourceUrl ?? '', c?.confirmedBy ?? '', c?.evidence ?? ''].map(esc).join(','));
  }
}
writeFileSync(join(ROOT, 'collector', 'review.csv'), lines.join('\n') + '\n');
write('collection-notes.json', {
  unreadableMarketplaces: unreadableMarketplaces.filter((m) => software.some((x) => softwareIdFor(m.software) === x.id || config.marketplaceTargets[m.software]?.includes(x.id))).map(({ software, reason }) => ({ software, reason })),
  excludedEditors: Object.entries(config.excludedEditors).map(([id, reason]) => ({ id, reason })),
});
writeFileSync(join(RAW, 'build-report.json'), JSON.stringify({ unmapped, comingSoon, unreadableMarketplaces, overrides, directoryStats }, null, 2));

const count = (status) => kept.filter((c) => c.status === status).length;
console.log(`${COUNTRIES.join(', ')}: ${editors.length} vendors, ${software.length} software, ${markets.length} market entries`);
console.log(`${kept.length} connections: ${count('confirmed')} confirmed, ${count('directory')} from the directory, ${count('declared')} declared; ${kept.filter((c) => c.viaChift).length} through Chift; ${overrides} overrides`);
console.log(`directory: ${directoryStats.tools} tools, ${directoryStats.merged} merged with a collected vendor`);
for (const cat of config.categories) {
  const list = editors.filter((e) => e.category === cat.id);
  if (list.length) console.log(`  ${cat.label}: ${list.length} vendors (${COUNTRIES.map((code) => `${code} ${list.filter((e) => e.markets.includes(code)).length}`).join(', ')})`);
}
console.log(`${unmapped.length} raw names outside the markets (see collector/raw/build-report.json)`);
