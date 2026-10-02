import { notFound } from 'next/navigation';
import { store } from '@/lib/store';
import { MOCK_MODE } from '@/adapters/types';
import type { LeadScore } from '@/scoring/lead';
import type { CompanyProfile } from '@/adapters/types';

export const dynamic = 'force-dynamic';

const ROUTE_LABEL: Record<string, string> = {
  ae: 'AE alert + CRM', csm: 'CSM alert', nurture: 'Nurture sequence', newsletter: 'Newsletter only', excluded: 'No sales routing',
};
const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });

// What the Chift team sees. In production this page sits behind SSO; here it is open for the demo.
// The internal view lists visitors' emails. When INTERNAL_KEY is set (the hosted demo), it opens only with ?key=.
export default async function Internal({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const key = process.env.INTERNAL_KEY;
  if (key && (await searchParams).key !== key) notFound();

  const leads = store.listLeads();
  const outbox = store.listOutbox();
  const corrections = store.listCorrections();
  const byRoute = leads.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.route]: (acc[l.route] ?? 0) + 1 }), {});
  const byCountry = leads.flatMap((l) => JSON.parse(l.countries) as string[]).reduce<Record<string, number>>((acc, c) => ({ ...acc, [c]: (acc[c] ?? 0) + 1 }), {});

  return (
    <div className="internal">
      <h1>Internal view</h1>
      <p className="muted">
        What sales and marketing see. {MOCK_MODE ? 'Simulated mode: Slack, CRM and email messages are stored here instead of being sent.' : 'Live mode: messages are sent, and logged here.'}
      </p>

      <div className="kpis">
        <div><b>{leads.length}</b><span>reports requested</span></div>
        <div><b>{byRoute.ae ?? 0}</b><span>to an AE</span></div>
        <div><b>{byRoute.csm ?? 0}</b><span>to a CSM</span></div>
        <div><b>{byRoute.nurture ?? 0}</b><span>in nurture</span></div>
        <div><b>{(byRoute.newsletter ?? 0) + (byRoute.excluded ?? 0)}</b><span>newsletter or excluded</span></div>
        <div><b>{corrections.length}</b><span>corrections received</span></div>
      </div>

      <p className="muted small">
        Reports by country: {Object.entries(byCountry).map(([c, n]) => `${c} ${n}`).join(' · ') || 'none yet'}. Page visits are not tracked in this prototype.
      </p>

      <h2>Leads</h2>
      {leads.length === 0 && <p className="muted">No report requested yet.</p>}
      {leads.map((l) => {
        const score = JSON.parse(l.score) as LeadScore;
        const company = JSON.parse(l.enrichment) as CompanyProfile;
        const messages = outbox.filter((o) => o.lead_id === l.id).reverse();
        return (
          <article key={l.id} className="lead">
            <header>
              <div>
                <h3>{company.name ?? l.company_domain} <span className="muted">· {l.email} · {l.role || 'no role'}</span></h3>
                <p className="muted small">
                  {time(l.created_at)} · {(JSON.parse(l.countries) as string[]).join(', ')} · benchmarked domain {l.subject_domain} ·{' '}
                  {company.employees ? `${company.employees} employees` : 'size unknown'} · enrichment: {company.source}
                </p>
              </div>
              <div className="routebox">
                <span className={`route route-${l.route}`}>{ROUTE_LABEL[l.route]}</span>
                <strong>{score.total}<small>/100</small></strong>
              </div>
            </header>
            <p className="small"><strong>Why this route:</strong> {l.route_reason}.</p>
            <table className="plain small">
              <tbody>
                {score.lines.map((line) => (
                  <tr key={line.criterion}><th scope="row">{line.criterion}</th><td>{line.points} / {line.max}</td><td>{line.why}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="messages">
              {messages.map((m) => {
                const p = JSON.parse(m.payload);
                return (
                  <div key={m.id} className={`msg msg-${m.channel}`}>
                    <span className="chan">{m.channel}{p.channel ? ` ${p.channel}` : ''} · {m.mode === 'mock' ? 'simulated' : 'sent'}</span>
                    <pre>{p.text ?? p.body ?? JSON.stringify(p, null, 2)}</pre>
                  </div>
                );
              })}
            </div>
            <p className="small"><a href={`/report/${l.id}`}>Open the report this lead received</a></p>
          </article>
        );
      })}

      <h2>Corrections</h2>
      {corrections.length === 0 ? <p className="muted">None yet. A correction from a vendor is also an interest signal.</p> : (
        <table className="plain">
          <thead><tr><th>When</th><th>Cell</th><th>Message</th></tr></thead>
          <tbody>
            {corrections.map((c) => (
              <tr key={c.id}><td>{time(c.created_at)}</td><td>{c.editor_id} × {c.software_id}</td><td>{c.message}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
