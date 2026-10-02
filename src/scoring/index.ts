// All benchmark maths. Pure functions, no network, no file access.
// Weights are importance levels, never market shares.
import type { Connection, CountryCode, Dataset, Importance } from '@/lib/schema';

export const WEIGHT: Record<Importance, number> = { dominant: 3, important: 2, secondary: 1 };

// Full credit when a second source backs the connection (the software's marketplace, or Chift's directory),
// or when the vendor describes a live one. Half credit for a file export (data goes out, nothing comes back)
// and when the vendor does not say how.
export function credit(connection: Connection | undefined): number {
  if (!connection) return 0;
  if (connection.status !== 'declared') return 1;
  return connection.kind === 'file_export' || connection.kind === 'unknown' ? 0.5 : 1;
}

// Connections indexed once per dataset: the matrix asks for thousands of cells.
const indexes = new WeakMap<Connection[], Map<string, Connection>>();

export function findConnection(ds: Dataset, editorId: string, softwareId: string) {
  let index = indexes.get(ds.connections);
  if (!index) {
    index = new Map(ds.connections.map((c) => [`${c.editorId}|${c.softwareId}`, c]));
    indexes.set(ds.connections, index);
  }
  return index.get(`${editorId}|${softwareId}`);
}

export function marketOf(ds: Dataset, country: CountryCode) {
  return ds.markets.filter((m) => m.country === country);
}

export type Coverage = { index: number; connected: number; total: number };

export function coverage(ds: Dataset, editorId: string, country: CountryCode): Coverage {
  const market = marketOf(ds, country);
  const totalWeight = market.reduce((sum, m) => sum + WEIGHT[m.importance], 0);
  if (totalWeight === 0) return { index: 0, connected: 0, total: 0 };
  let got = 0;
  let connected = 0;
  for (const m of market) {
    const c = credit(findConnection(ds, editorId, m.softwareId));
    got += c * WEIGHT[m.importance];
    if (c > 0) connected++;
  }
  return { index: Math.round((100 * got) / totalWeight), connected, total: market.length };
}

// Competitors: same category, active in the country (a connection found there, or their home market).
export function peers(ds: Dataset, editorId: string, country: CountryCode) {
  const self = ds.editors.find((e) => e.id === editorId);
  return ds.editors.filter((e) => e.id !== editorId && (!self || e.category === self.category) && e.markets.includes(country));
}

export function activeIn(ds: Dataset, country: CountryCode, category?: string) {
  return ds.editors.filter((e) => e.markets.includes(country) && (!category || e.category === category));
}

export function averageCoverage(ds: Dataset, country: CountryCode, category?: string, exceptEditorId?: string): number {
  const editors = activeIn(ds, country, category).filter((e) => e.id !== exceptEditorId);
  if (editors.length === 0) return 0;
  const sum = editors.reduce((s, e) => s + coverage(ds, e.id, country).index, 0);
  return Math.round(sum / editors.length);
}

export type CompetitorShare = { share: number; connected: number; total: number };

export function competitorShare(ds: Dataset, softwareId: string, editorId: string, country: CountryCode): CompetitorShare {
  const others = peers(ds, editorId, country);
  const connected = others.filter((e) => credit(findConnection(ds, e.id, softwareId)) > 0).length;
  return { share: others.length ? connected / others.length : 0, connected, total: others.length };
}

export type Gap = {
  softwareId: string;
  importance: Importance;
  weight: number;
  competitorsConnected: number;
  competitorsTotal: number;
  share: number;
  priority: number;
};

// A gap is flagged when at least `minShare` of competitors are connected and the editor is not.
// Below `minPeers` competitors in the country, one vendor would decide alone: nothing is flagged.
export const MIN_PEERS = 3;

export function gaps(ds: Dataset, editorId: string, country: CountryCode, minShare = 0.5, minPeers = MIN_PEERS): Gap[] {
  return marketOf(ds, country)
    .filter((m) => credit(findConnection(ds, editorId, m.softwareId)) === 0)
    .map((m) => {
      const s = competitorShare(ds, m.softwareId, editorId, country);
      const weight = WEIGHT[m.importance];
      return {
        softwareId: m.softwareId,
        importance: m.importance,
        weight,
        competitorsConnected: s.connected,
        competitorsTotal: s.total,
        share: s.share,
        priority: Math.round(weight * (1 + s.share) * 100) / 100,
      };
    })
    .filter((g) => g.share >= minShare && g.competitorsTotal >= minPeers)
    .sort((a, b) => b.priority - a.priority);
}

// Connections that count for half: not a gap, an upgrade to consider.
export function halfCredit(ds: Dataset, editorId: string, country: CountryCode) {
  return marketOf(ds, country)
    .map((m) => findConnection(ds, editorId, m.softwareId))
    .filter((c): c is Connection => !!c && credit(c) === 0.5);
}

export type Confidence = 'high' | 'medium' | 'low';

// How many independent kinds of evidence back a country's software list.
export function confidence(evidenceKinds: number): Confidence {
  if (evidenceKinds >= 3) return 'high';
  if (evidenceKinds === 2) return 'medium';
  return 'low';
}

export function estimatedCost(priorityGaps: number, unit: { low: number; high: number }) {
  return { low: priorityGaps * unit.low, high: priorityGaps * unit.high };
}
