// Turns a domain into a benchmark subject and computes what the panel and the report show.
import type { Connection, CountryCode, Dataset, Editor } from './schema';
import { averageCoverage, coverage, gaps, halfCredit, type Gap } from '@/scoring';

export const VISITOR_ID = 'visitor';

export function cleanDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');
}

export type Subject =
  | { kind: 'editor'; editorId: string; domain: string }
  | { kind: 'scanned'; domain: string; connections: Connection[]; pageUrl: string | null }
  | { kind: 'unknown'; domain: string };

export function findEditor(ds: Dataset, domain: string): Editor | undefined {
  const d = cleanDomain(domain);
  if (!d) return undefined;
  return ds.editors.find((e) => e.domain && (e.domain === d || d.endsWith(`.${e.domain}`)));
}

// One vertical at a time: vendors are only compared with vendors of their own category.
export function forCategory(ds: Dataset, category: string): Dataset {
  return { ...ds, editors: ds.editors.filter((e) => e.category === category) };
}

const ALL_COUNTRIES: CountryCode[] = ['FR', 'DE', 'BE', 'NL', 'GB', 'ES', 'IT', 'DK', 'SE', 'NO'];

// A visitor outside the dataset becomes a temporary editor so the same maths applies.
// A known vendor brings its own category; an unknown one is compared with the category picked on the page.
export function withSubject(ds: Dataset, subject: Subject, category: string): { ds: Dataset; editorId: string; category: string } {
  if (subject.kind === 'editor') {
    const own = ds.editors.find((e) => e.id === subject.editorId)!.category;
    return { ds: forCategory(ds, own), editorId: subject.editorId, category: own };
  }
  const visitor: Editor = {
    id: VISITOR_ID, name: subject.domain, domain: subject.domain, category, hq: '--', markets: ALL_COUNTRIES,
    integrationsUrl: subject.kind === 'scanned' ? subject.pageUrl : null, unreadable: [],
  };
  const connections = subject.kind === 'scanned' ? subject.connections.map((c) => ({ ...c, editorId: VISITOR_ID })) : [];
  const sliced = forCategory(ds, category);
  return { ds: { ...sliced, editors: [...sliced.editors, visitor], connections: [...sliced.connections, ...connections] }, editorId: VISITOR_ID, category };
}

export type CountryResult = {
  country: CountryCode;
  coverage: number;
  connected: number;
  total: number;
  competitorAverage: number;
  gaps: Gap[];
  halfCredit: string[];
};

export function benchmark(ds: Dataset, editorId: string, countryCodes: CountryCode[], minShare: number): CountryResult[] {
  return countryCodes.map((country) => {
    const c = coverage(ds, editorId, country);
    return {
      country,
      coverage: c.index,
      connected: c.connected,
      total: c.total,
      competitorAverage: averageCoverage(ds, country, undefined, editorId),
      gaps: gaps(ds, editorId, country, minShare),
      halfCredit: halfCredit(ds, editorId, country).map((x) => x.softwareId),
    };
  });
}

export function countPriorityGaps(results: CountryResult[]): number {
  return new Set(results.flatMap((r) => r.gaps.map((g) => g.softwareId))).size;
}
