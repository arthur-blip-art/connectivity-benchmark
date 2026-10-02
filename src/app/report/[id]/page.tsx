import { notFound } from 'next/navigation';
import { countries, dataset, measures, settings } from '@/lib/data';
import { computeFor, resolveSubject } from '@/lib/pipeline';
import { cleanDomain } from '@/lib/benchmark';
import { store } from '@/lib/store';
import { CountryCode } from '@/lib/schema';
import { confidence, estimatedCost, marketOf } from '@/scoring';
import { ExpertButton } from '@/components/ExpertButton';

export const dynamic = 'force-dynamic';

const money = (n: number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
const CHANNEL = { accountant: 'The accountant', sme: 'The SME itself', shared: 'Both, on a shared platform' };

const fmtDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

type Query = { d?: string; c?: string; k?: string };

// The stored lead first. Without it (a fresh serverless instance), the parameters carried by the report link.
function fromQuery(id: string, q: Query) {
  const domain = cleanDomain(q.d ?? '');
  const codes = (q.c ?? '').split(',').filter((c) => CountryCode.safeParse(c).success);
  const category = settings.categories.find((c) => c.id === q.k)?.id;
  if (!domain || !codes.length || codes.length > 3 || !category) return null;
  return { id, subject_domain: domain, countries: JSON.stringify(codes), category };
}

export default async function Report({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { id } = await params;
  const lead = store.getLead(id) ?? fromQuery(id, await searchParams);
  if (!lead) notFound();

  const codes = JSON.parse(lead.countries) as CountryCode[];
  const subject = resolveSubject(lead.subject_domain);
  const { ds, editorId, results, category } = computeFor(subject, codes, lead.category);
  const categoryLabel = settings.categories.find((c) => c.id === category)?.label ?? category;
  const name = ds.editors.find((e) => e.id === editorId)?.name ?? lead.subject_domain;
  const software = (sid: string) => ds.software.find((s) => s.id === sid)!;
  const country = (code: string) => countries.find((c) => c.code === code)!;

  const ranked = results
    .flatMap((r) => r.gaps.map((g) => ({ ...g, country: r.country })))
    .sort((a, b) => b.priority - a.priority);
  const distinct = new Set(ranked.map((g) => g.softwareId)).size;
  const cost = estimatedCost(distinct, settings.connectorCost);

  return (
    <article className="report">
      <header>
        <p className="eyebrow">Connectivity report · {categoryLabel} · data collected {fmtDate(settings.collectedAt)}</p>
        <h1>{name}: accounting connectivity in {codes.map((c) => country(c).name).join(', ')}</h1>
        {subject.kind === 'scanned' && (
          <p className="notice">
            {lead.subject_domain} is not part of the reviewed dataset. Its row comes from an automated read of{' '}
            <a href={subject.pageUrl ?? '#'} target="_blank" rel="noreferrer">its public page</a>, not yet checked by a person.
          </p>
        )}
        {subject.kind === 'unknown' && (
          <p className="notice">
            We found no public integrations page for {lead.subject_domain}. Every connector below shows as not found publicly,
            which is not a claim that you have none. Reply to the report email and we will correct your row.
          </p>
        )}
      </header>

      <section aria-labelledby="r1">
        <h2 id="r1"><span>1</span> Where you stand</h2>
        <div className="scorecards">
          {results.map((r) => (
            <div key={r.country} className="scorecard">
              <h3>{country(r.country).name}</h3>
              <p className="big">{r.coverage}<small>/100</small></p>
              <div className="compare">
                <div><span className="bar"><i style={{ width: `${r.coverage}%` }} /></span><em>You</em></div>
                <div><span className="bar alt"><i style={{ width: `${r.competitorAverage}%` }} /></span><em>Competitor average {r.competitorAverage}</em></div>
              </div>
              <p className="muted">{r.connected} of {r.total} accounting software reached.</p>
            </div>
          ))}
        </div>
        <p className="muted small">Coverage index: importance-weighted share of a country&apos;s accounting software a vendor reaches. Not a market share.</p>
      </section>

      <section aria-labelledby="r2">
        <h2 id="r2"><span>2</span> Missing connectors, by priority</h2>
        {ranked.length === 0 ? (
          <p>No gap flagged: no software in these countries is reached by at least half of your competitors and missing on your side.</p>
        ) : (
          <table className="plain">
            <thead>
              <tr><th>Software</th><th>Country</th><th>Importance</th><th>Competitors connected</th><th>Priority</th></tr>
            </thead>
            <tbody>
              {ranked.map((g) => (
                <tr key={`${g.country}-${g.softwareId}`}>
                  <th scope="row">{software(g.softwareId).name}</th>
                  <td>{country(g.country).name}</td>
                  <td><span className={`tier tier-${g.importance}`}>{g.importance}</span></td>
                  <td>{g.competitorsConnected} of {g.competitorsTotal}</td>
                  <td>{g.priority.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">Priority = importance weight × (1 + share of competitors connected). A connector is listed when at least half of your competitors have it, and at least three competitors are active in the country.</p>
        {results.some((r) => r.halfCredit.length > 0) && (
          <p>
            Counted for half: {results.flatMap((r) => r.halfCredit).filter((v, i, a) => a.indexOf(v) === i).map((sid) => software(sid).name).join(', ')}.
            Your public pages describe a file export, or do not say how the connection works. A live two-way connection would count in full.
          </p>
        )}
      </section>

      <section aria-labelledby="r3">
        <h2 id="r3"><span>3</span> Playbook per country</h2>
        <div className="playbooks">
          {codes.map((code) => {
            const c = country(code);
            const market = marketOf(dataset, code);
            const dominant = market.filter((m) => m.importance === 'dominant').map((m) => software(m.softwareId).name);
            return (
              <div key={code} className="playbook">
                <h3>{c.name}</h3>
                <dl>
                  <dt>Who picks the software</dt>
                  <dd><strong>{CHANNEL[c.channel.value]}.</strong> {c.channel.explanation}</dd>
                  <dt>Dominant software</dt>
                  <dd>{dominant.join(', ') || 'None stands out in our sources.'}</dd>
                  <dt>E-invoicing reform</dt>
                  <dd>
                    {c.reform.summary}
                    <ul>{c.reform.milestones.map((m) => <li key={m.date + m.what}><strong>{fmtDate(m.date)}</strong>: {m.what}</li>)}</ul>
                  </dd>
                  {c.note && (<><dt>Watch out</dt><dd>{c.note.text}</dd></>)}
                </dl>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="r4">
        <h2 id="r4"><span>4</span> Order of magnitude if built in house</h2>
        {distinct === 0 ? (
          <p>No priority connector to build.</p>
        ) : (
          <p className="cost">
            <strong>{money(cost.low, settings.connectorCost.currency)} to {money(cost.high, settings.connectorCost.currency)}</strong>{' '}
            for {distinct} connector{distinct > 1 ? 's' : ''}, {settings.connectorCost.basis}.
          </p>
        )}
        <p className="muted small">
          An order of magnitude, not a quote. The unit figure is published by a vendor of integration platforms:{' '}
          {settings.connectorCost.sources.map((s, i) => (
            <span key={s.url}>{i > 0 && ', '}<a href={s.url} target="_blank" rel="noreferrer">{s.who}</a> (&ldquo;{s.quote}&rdquo;)</span>
          ))}.
        </p>
      </section>

      <section aria-labelledby="r5">
        <h2 id="r5"><span>5</span> Method and sources</h2>
        <p>
          One collection, on {fmtDate(settings.collectedAt)}. {settings.reviewNote} A connection is <strong>confirmed</strong> when the accounting
          software lists the vendor on its own marketplace, <strong>listed</strong> when it appears in connect-compta, Chift&apos;s directory for France,
          <strong>declared</strong> when only the vendor says so. Importance levels are not market shares.
        </p>
        <table className="plain">
          <thead><tr><th>Country</th><th>Confidence</th><th>Evidence behind the software list</th></tr></thead>
          <tbody>
            {codes.map((code) => {
              const c = country(code);
              const m = measures.find((x) => x.country === code);
              return (
                <tr key={code}>
                  <th scope="row">{c.name}</th>
                  <td><span className={`badge conf-${confidence(c.evidenceKinds.length)}`}>{confidence(c.evidenceKinds.length)}</span></td>
                  <td>
                    {c.evidenceKinds.map((k, i) => (
                      <span key={k.label}>{i > 0 && ' · '}{k.url ? <a href={k.url} target="_blank" rel="noreferrer">{k.label}</a> : k.label}</span>
                    ))}
                    {m && <span className="muted"> ({m.base.n.toLocaleString('en-GB')} {m.base.label})</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <details>
          <summary>Your {results.reduce((n, r) => n + r.connected, 0)} connections and their sources</summary>
          <ul className="sources">
            {ds.connections.filter((c) => c.editorId === editorId).map((c) => (
              <li key={c.softwareId}>
                {software(c.softwareId).name}: {c.status === 'directory' ? 'listed in connect-compta' : c.status}{c.viaChift ? ', through Chift' : c.kind === 'file_export' ? ', file export' : c.kind === 'unknown' && c.status === 'declared' ? ', type not stated' : ''}.{' '}
                <a href={c.sourceUrl} target="_blank" rel="noreferrer">{new URL(c.sourceUrl).hostname}</a>, {c.collectedAt}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="cta" aria-labelledby="r6">
        <h2 id="r6"><span>6</span> Close the gaps without building them</h2>
        <p>Chift connects a product to these accounting software through one API. A 30-minute call is enough to check which of your gaps it covers today.</p>
        <ExpertButton leadId={lead.id} />
      </section>
    </article>
  );
}
