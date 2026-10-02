// Prints what a demo journey shows, straight from the data.
//   npx tsx collector/scenarios.ts pleo.io:FR,BE mooncard.co:DE,BE qonto.com:FR,DE
import { dataset, settings } from '../src/lib/data';
import { benchmark, findEditor, withSubject } from '../src/lib/benchmark';
import type { CountryCode } from '../src/lib/schema';

const name = (id: string) => dataset.software.find((s) => s.id === id)!.name;
const asked = process.argv.slice(2).length ? process.argv.slice(2) : ['pleo.io:FR,BE', 'mooncard.co:DE,BE', 'qonto.com:FR,DE'];
for (const arg of asked) {
  const [domain, codes] = arg.split(':');
  const editor = findEditor(dataset, domain);
  if (!editor) { console.log(`\n${domain}: not in the dataset`); continue; }
  const { ds, editorId, category } = withSubject(dataset, { kind: 'editor', editorId: editor.id, domain }, editor.category);
  console.log(`\n${editor.name} (${settings.categories.find((c) => c.id === category)?.label})`);
  for (const r of benchmark(ds, editorId, codes.split(',') as CountryCode[], settings.gapMinCompetitorShare)) {
    console.log(`  ${r.country}: ${r.coverage}/100, competitor average ${r.competitorAverage}, ${r.connected} of ${r.total} software`);
    for (const g of r.gaps) console.log(`     gap ${name(g.softwareId)} (${g.importance}): ${g.competitorsConnected} of ${g.competitorsTotal}, priority ${g.priority}`);
    if (r.halfCredit.length) console.log(`     half credit: ${r.halfCredit.map(name).join(', ')}`);
  }
}
