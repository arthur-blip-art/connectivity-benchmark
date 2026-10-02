import { Benchmark } from '@/components/Benchmark';
import { collectionNotes, countries, dataset, measures, settings } from '@/lib/data';
import { europeShapes } from '@/lib/map';
import { CountryCode } from '@/lib/schema';
import { cleanDomain } from '@/lib/benchmark';
import { examples } from '@/lib/examples';

const MAP = { width: 520, height: 640 };

type Search = Promise<{ domain?: string; countries?: string; category?: string }>;

export default async function Home({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  // A link sent in outbound can open on the prospect's own row: ?category=expense&domain=pleo.io&countries=DE,BE
  const asked = (params.countries ?? '').split(',').map((c) => CountryCode.safeParse(c.trim().toUpperCase())).flatMap((r) => (r.success ? [r.data] : []));
  const fromLink = settings.categories.find((c) => c.id === params.category)?.id;
  const initial = {
    domain: params.domain ? cleanDomain(params.domain) : '',
    countries: (asked.filter((code) => countries.some((c) => c.code === code)).slice(0, 3)) as typeof asked,
    category: fromLink ?? settings.categories[0].id,
  };
  if (initial.countries.length === 0) initial.countries = countries.slice(0, 3).map((c) => c.code);
  const connections = dataset.connections.length;
  const backed = dataset.connections.filter((c) => c.status !== 'declared').length;
  const viaChift = dataset.connections.filter((c) => c.viaChift).length;

  return (
    <>
      <section className="hero">
        <h1>Which accounting software do your competitors connect to, <em>and you don&apos;t?</em></h1>
        <p>
          {dataset.editors.length} software vendors in {settings.categories.length} categories, {dataset.software.length} accounting software,{' '}
          {countries.length} countries. {connections} connections read on public pages, {backed} of them backed by a second source,{' '}
          {viaChift} running through Chift. Every cell links to its source.
        </p>
      </section>

      <Benchmark
        dataset={dataset}
        countries={countries}
        settings={settings}
        measures={measures}
        shapes={europeShapes(MAP.width, MAP.height)}
        mapSize={MAP}
        initial={initial}
        examples={examples}
      />

      <section className="method" id="method">
        <h2>Method</h2>
        <div className="cols">
          <div>
            <h3>What a cell means</h3>
            <p>
              <strong>Confirmed</strong>: the accounting software lists the vendor on its own marketplace or partner page.{' '}
              <strong>Listed</strong>: the connection appears in connect-compta, Chift&apos;s public directory for France.{' '}
              <strong>Declared</strong>: the vendor says so on its site or help centre.{' '}
              <strong>Not found publicly</strong>: we found no public page. It is not a claim that the connection does not exist.
            </p>
          </div>
          <div>
            <h3>The coverage index</h3>
            <p>
              Each software has a level in a country: dominant counts 3, important 2, secondary 1.
              The index is the weighted share of the country&apos;s software a vendor reaches, out of 100.
              A vendor is compared with the vendors of its own category that are active in the country.
              A file export, or a connection whose type the vendor does not state, counts for half. It is an index, never a market share.
            </p>
          </div>
          <div>
            <h3>Where importance comes from</h3>
            <p>
              The software list of each country and its levels come from Chift&apos;s State of European Accounting Tech 2026, a survey of
              1,400 companies. Where Peppol lets us, we also count for real: each company number is looked up on the network and the
              access point certificate names the platform. That is the connect-compta barometer in France, and our own sample in Belgium.
            </p>
          </div>
          <div>
            <h3>Collection</h3>
            <p>
              One collection, on {settings.collectedAt}. Public pages only. {settings.reviewNote}{' '}
              A site that refuses to be read is listed, not worked around.
              {collectionNotes.unreadableMarketplaces.length > 0 && (
                <> Marketplaces not read: {collectionNotes.unreadableMarketplaces.map((m) => `${m.software} (${m.reason})`).join('; ')}.</>
              )}
              {collectionNotes.excludedEditors.length > 0 && (
                <> Left out: {collectionNotes.excludedEditors.map((e) => e.reason).join(' ')}</>
              )}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
