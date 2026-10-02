// Reference data: collected once, reviewed by hand, validated against the schemas on every build.
import { z } from 'zod';
import editorsJson from '@data/editors.json';
import softwareJson from '@data/software.json';
import marketsJson from '@data/markets.json';
import countriesJson from '@data/countries.json';
import connectionsJson from '@data/connections.json';
import settingsJson from '@data/settings.json';
import chiftJson from '@data/chift-accounts.json';
import measuresJson from '@data/measures.json';
import notesJson from '@data/collection-notes.json';
import { ChiftAccount, Connection, Country, CountryCode, Editor, Market, Settings, Software, type Dataset } from './schema';

export const dataset: Dataset = {
  editors: z.array(Editor).parse(editorsJson),
  software: z.array(Software).parse(softwareJson),
  markets: z.array(Market).parse(marketsJson),
  connections: z.array(Connection).parse(connectionsJson),
};

export const countries = z.array(Country).parse(countriesJson);
export const settings = Settings.parse(settingsJson);

const Chift = z.object({ customers: z.array(ChiftAccount), competitors: z.array(ChiftAccount) });
export const chift = Chift.parse(chiftJson);

// Measured signal: which platform receives a company's e-invoices on Peppol.
export const Measure = z.object({
  country: CountryCode,
  title: z.string(),
  method: z.string(),
  source: z.object({ label: z.string(), url: z.string().url().nullable() }),
  compiledAt: z.string(),
  base: z.object({ label: z.string(), n: z.number() }),
  rows: z.array(z.object({ name: z.string(), n: z.number(), softwareId: z.string().nullable() })),
});
export type Measure = z.infer<typeof Measure>;
export const measures = z.array(Measure).parse(measuresJson);

// What the collection could not read or left out, said on the page.
export const collectionNotes = z.object({
  unreadableMarketplaces: z.array(z.object({ software: z.string(), reason: z.string() })),
  excludedEditors: z.array(z.object({ id: z.string(), reason: z.string() })),
}).parse(notesJson);

// Integrity: every reference points to something that exists.
for (const m of dataset.markets) {
  if (!dataset.software.some((s) => s.id === m.softwareId)) throw new Error(`markets.json: unknown software ${m.softwareId}`);
}
for (const c of dataset.connections) {
  if (!dataset.software.some((s) => s.id === c.softwareId)) throw new Error(`connections.json: unknown software ${c.softwareId}`);
  if (!dataset.editors.some((e) => e.id === c.editorId)) throw new Error(`connections.json: unknown editor ${c.editorId}`);
}
