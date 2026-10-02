import { z } from 'zod';

export const CountryCode = z.enum(['FR', 'DE', 'BE', 'NL', 'GB', 'ES', 'IT', 'DK', 'SE', 'NO']);
export type CountryCode = z.infer<typeof CountryCode>;

export const Importance = z.enum(['dominant', 'important', 'secondary']);
export type Importance = z.infer<typeof Importance>;

const url = z.string().url();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const Editor = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  category: z.string(),
  hq: z.string().length(2),
  integrationsUrl: url.nullable(),
  // Countries where the vendor counts as a competitor: at least one connection found there, or its home market.
  markets: z.array(CountryCode),
  // Pages the collector could not read, and why. Shown in the method section.
  unreadable: z.array(z.object({ url: z.string(), reason: z.string() })).default([]),
});
export type Editor = z.infer<typeof Editor>;

export const Software = z.object({
  id: z.string(),
  name: z.string(),
  vendor: z.string(),
  target: z.enum(['sme', 'firm', 'both']),
  url: url.nullable(),
  marketplaceUrl: url.nullable(),
  // Other spellings found on vendor pages. Used by the live page reader.
  aliases: z.array(z.string()).default([]),
  // True when the name is a common word or an acronym: only matched with its brand casing.
  cased: z.boolean().default(false),
});
export type Software = z.infer<typeof Software>;

export const Market = z.object({
  country: CountryCode,
  softwareId: z.string(),
  importance: Importance,
  evidence: z.string(),
  sources: z.array(url).min(1),
});
export type Market = z.infer<typeof Market>;

export const Country = z.object({
  code: CountryCode,
  name: z.string(),
  channel: z.object({
    // Who picks the accounting software: the accountant, the SME, or both on a shared platform.
    value: z.enum(['accountant', 'sme', 'shared']),
    explanation: z.string(),
    sources: z.array(url),
  }),
  reform: z.object({
    summary: z.string(),
    network: z.string(),
    milestones: z.array(z.object({ date: isoDate, what: z.string() })),
    sources: z.array(url),
  }),
  note: z.object({ text: z.string(), sources: z.array(url) }).nullable(),
  // Independent kinds of evidence behind the software list of this country.
  evidenceKinds: z.array(z.object({ kind: z.string(), label: z.string(), url: url.nullable() })).min(1),
});
export type Country = z.infer<typeof Country>;

export const ConnectionKind = z.enum(['api', 'file_export', 'via_partner', 'unknown']);
export type ConnectionKind = z.infer<typeof ConnectionKind>;

// A connection without a source does not exist: there is no "not found" row,
// the absence of a row is what the interface shows as "not found publicly".
//   confirmed: the accounting software lists the vendor on its own marketplace
//   directory: listed in connect-compta, Chift's public directory for France
//   declared:  only the vendor says so
export const Connection = z.object({
  editorId: z.string(),
  softwareId: z.string(),
  status: z.enum(['confirmed', 'directory', 'declared']),
  kind: ConnectionKind,
  // Set when a public page says the connection runs through Chift.
  viaChift: z.boolean().default(false),
  sourceUrl: url,
  evidence: z.string(),
  // The second source, when there is one: marketplace listing or directory.
  confirmedBy: url.nullable(),
  collectedAt: isoDate,
});
export type Connection = z.infer<typeof Connection>;

export const Settings = z.object({
  collectedAt: isoDate,
  categories: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
  gapMinCompetitorShare: z.number().min(0).max(1),
  connectorCost: z.object({
    low: z.number(),
    high: z.number(),
    currency: z.string(),
    basis: z.string(),
    sources: z.array(z.object({ who: z.string(), url, quote: z.string() })),
  }),
  routing: z.object({ aeThreshold: z.number(), nurtureThreshold: z.number() }),
  // Who checked the collection, said as it is. Shown in every method section.
  reviewNote: z.string(),
});
export type Settings = z.infer<typeof Settings>;

// Customers are only listed with a public source. Competitors may have none.
export const ChiftAccount = z.object({ name: z.string(), domain: z.string(), sourceUrl: url.nullable() });
export type ChiftAccount = z.infer<typeof ChiftAccount>;

export type Dataset = {
  editors: Editor[];
  software: Software[];
  markets: Market[];
  connections: Connection[];
};
