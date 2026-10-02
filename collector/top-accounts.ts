// The accounts most worth writing to for Chift, one line per vendor, ranked by the strongest coverage gap.
//   npx tsx collector/top-accounts.ts --top 10 [--exclude known-domains.txt] [--category expense]
// Every vendor in the dataset already ships integrations (it was collected from its integrations pages, connect-compta
// or a ledger's marketplace), so signal 1 holds by construction; the rank is signal 2, the gap against competitors.
// Removed before ranking, and counted: Chift customers and competitors, domains in --exclude (HubSpot, lists already
// worked), vendors whose pages could not be read (their gap may only be ours), vendors known to have over 500 people.
import { readFileSync, existsSync } from 'node:fs';
import { chift, dataset, settings } from '../src/lib/data';
import { benchmark, withSubject } from '../src/lib/benchmark';
import fixture from '../data/enrichment-fixture.json';

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const top = Number(opt('--top') ?? 10);
const onlyCategory = opt('--category');
const excludeFile = opt('--exclude');
const excluded = new Set(
  excludeFile && existsSync(excludeFile)
    ? readFileSync(excludeFile, 'utf8').split(/\s+/).map((d) => d.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean)
    : [],
);
const headcount = new Map((fixture as { domain: string; employees: number | null }[]).map((f) => [f.domain, f.employees]));
const customers = new Set(chift.customers.map((c) => c.domain));
const competitors = new Set(chift.competitors.map((c) => c.domain));
const name = (id: string) => dataset.software.find((s) => s.id === id)!.name;
const label = (id: string) => settings.categories.find((c) => c.id === id)?.label ?? id;

const removed = { customer: 0, competitor: 0, known: 0, unreadable: 0, size: 0, noGap: 0 };
const rows: { weight: number; cells: string[] }[] = [];
for (const editor of dataset.editors) {
  if (!editor.domain || (onlyCategory && editor.category !== onlyCategory)) continue;
  if (customers.has(editor.domain)) { removed.customer++; continue; }
  if (competitors.has(editor.domain)) { removed.competitor++; continue; }
  if (excluded.has(editor.domain)) { removed.known++; continue; }
  const connections = dataset.connections.filter((c) => c.editorId === editor.id).length;
  if (editor.unreadable.length && connections < 2) { removed.unreadable++; continue; }
  const people = headcount.get(editor.domain);
  if (typeof people === 'number' && people > 500) { removed.size++; continue; }

  const { ds, editorId } = withSubject(dataset, { kind: 'editor', editorId: editor.id, domain: editor.domain }, editor.category);
  let best: { weight: number; cells: string[] } | null = null;
  for (const r of benchmark(ds, editorId, editor.markets, settings.gapMinCompetitorShare)) {
    const g = r.gaps[0];
    if (!g) continue;
    const weight = g.priority * 10 + (r.competitorAverage - r.coverage);
    if (!best || weight > best.weight) {
      best = {
        weight,
        cells: [
          editor.name, editor.domain, label(editor.category), r.country, `${r.coverage}/100 vs ${r.competitorAverage}`,
          `${name(g.softwareId)} (${g.importance}), ${g.competitorsConnected} of ${g.competitorsTotal} competitors`,
          typeof people === 'number' ? String(people) : 'to check',
          r.country === editor.hq ? 'HQ' : `inferred (HQ ${editor.hq})`,
          `https://connectivity-benchmark-ag.vercel.app/?domain=${editor.domain}&countries=${r.country}`,
        ],
      };
    }
  }
  if (best) rows.push(best); else removed.noGap++;
}

rows.sort((a, b) => b.weight - a.weight);
const header = ['#', 'Vendor', 'Domain', 'Category', 'Country', 'Index vs competitors', 'Strongest gap', 'People', 'Country basis', 'Proof link'];
console.log(`| ${header.join(' | ')} |\n|${header.map(() => '---').join('|')}|`);
rows.slice(0, top).forEach((r, i) => console.log(`| ${[String(i + 1), ...r.cells].join(' | ')} |`));
console.log(
  `\n${dataset.editors.length} vendors in the dataset, all already shipping integrations. Removed: ${removed.customer} Chift customers, ` +
    `${removed.competitor} competitors, ${removed.known} already known (--exclude), ${removed.unreadable} with unreadable pages, ` +
    `${removed.size} over 500 people, ${removed.noGap} with no gap reached by most competitors. ${rows.length} ranked.\n` +
    `Before writing: check "to check" headcounts, and for an inferred country, that the vendor has a local site or customers there.`,
);
