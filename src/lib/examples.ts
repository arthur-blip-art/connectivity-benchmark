// Example vendors a visitor can click instead of typing a domain: per category, the two whose gap shows best.
// Picked from the data, not by hand, so they follow every rebuild. Chift customers are left out.
import { chift, dataset, settings } from './data';
import { benchmark, withSubject } from './benchmark';
import type { CountryCode } from './schema';

export type Example = { domain: string; name: string; country: CountryCode };

const PER_CATEGORY = 2;

function build(): Record<string, Example[]> {
  const customers = new Set(chift.customers.map((c) => c.domain));
  const ranked: Record<string, { example: Example; weight: number }[]> = {};
  for (const editor of dataset.editors) {
    if (!editor.domain || customers.has(editor.domain)) continue;
    // A vendor whose pages we could not read shows a gap that may only be ours: never offer it as an example.
    const known = dataset.connections.filter((c) => c.editorId === editor.id).length;
    if (editor.unreadable.length && known < 2) continue;
    const { ds, editorId } = withSubject(dataset, { kind: 'editor', editorId: editor.id, domain: editor.domain }, editor.category);
    // The country where the vendor trails its competitors the most, weighted by its strongest gap there.
    let best: { country: CountryCode; weight: number } | null = null;
    for (const r of benchmark(ds, editorId, editor.markets, settings.gapMinCompetitorShare)) {
      const gap = r.gaps[0]?.priority ?? 0;
      const weight = gap * 10 + (r.competitorAverage - r.coverage);
      if (gap > 0 && (!best || weight > best.weight)) best = { country: r.country, weight };
    }
    if (best) (ranked[editor.category] ??= []).push({ example: { domain: editor.domain, name: editor.name.replace(/\s*\(.*\)$/, ''), country: best.country }, weight: best.weight });
  }
  return Object.fromEntries(
    Object.entries(ranked).map(([category, list]) => [category, list.sort((a, b) => b.weight - a.weight).slice(0, PER_CATEGORY).map((x) => x.example)]),
  );
}

export const examples = build();
