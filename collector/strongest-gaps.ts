// Lists the most striking gaps in the dataset: a dominant or important software that at least two thirds of a
// vendor's competitors reach in a country where the vendor is active, and the vendor does not.
//   npx tsx collector/strongest-gaps.ts [limit]
import { chift, dataset, settings } from '../src/lib/data';
import { benchmark, withSubject } from '../src/lib/benchmark';

const name = (id: string) => dataset.software.find((s) => s.id === id)!.name;
const customers = new Set(chift.customers.map((a) => a.domain));
const rows: string[][] = [];
for (const editor of dataset.editors) {
  if (!editor.domain) continue; // directory-only POS entries: no domain, nobody to write to
  const { ds, editorId } = withSubject(dataset, { kind: 'editor', editorId: editor.id, domain: editor.domain }, editor.category);
  for (const r of benchmark(ds, editorId, editor.markets, settings.gapMinCompetitorShare)) {
    for (const g of r.gaps) {
      if (g.importance === 'secondary' || g.competitorsConnected / g.competitorsTotal < 2 / 3) continue;
      rows.push([String(g.priority), editor.name, editor.domain, editor.category, r.country, `${r.coverage}/100 vs ${r.competitorAverage}`, `${name(g.softwareId)} (${g.importance})`, `${g.competitorsConnected} of ${g.competitorsTotal}`, customers.has(editor.domain) ? 'Chift customer' : '']);
    }
  }
}
rows.sort((a, b) => Number(b[0]) - Number(a[0]));
for (const r of rows.slice(0, Number(process.argv[2] ?? 30))) console.log(r.join(' | '));
