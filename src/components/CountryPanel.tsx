'use client';

import { useState } from 'react';
import type { Connection, Country, Dataset } from '@/lib/schema';
import type { Measure } from '@/lib/data';
import type { CountryResult } from '@/lib/benchmark';
import { confidence, coverage, findConnection, marketOf, MIN_PEERS, WEIGHT } from '@/scoring';
import { CellGlyph, cellLabel, Legend } from './Glyph';

type Props = {
  country: Country;
  ds: Dataset;
  categoryLabel: string;
  vendorCount: number;
  subjectId: string | null;
  subjectName: string | null;
  result: CountryResult | null;
  measure: Measure | null;
  average: number;
  collectedAt: string;
};

type Cell = { editorId: string; softwareId: string };

const CHANNEL = { accountant: 'The accountant', sme: 'The SME itself', shared: 'Both, on a shared platform' };

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const VISIBLE_ROWS = 12;

export function CountryPanel({ country, ds, categoryLabel, vendorCount, subjectId, subjectName, result, measure, average, collectedAt }: Props) {
  const [cell, setCell] = useState<Cell | null>(null);
  const [showAll, setShowAll] = useState(false);
  const market = marketOf(ds, country.code).sort((a, b) => WEIGHT[b.importance] - WEIGHT[a.importance]);
  const software = market.map((m) => ({ ...ds.software.find((s) => s.id === m.softwareId)!, importance: m.importance, evidence: m.evidence, sources: m.sources }));
  // Vendors of the category that are active in this country, best coverage first. The visitor always comes first.
  const allRows = ds.editors
    .filter((e) => e.markets.includes(country.code) || e.id === subjectId)
    .map((e) => ({ editor: e, cov: coverage(ds, e.id, country.code) }))
    .sort((a, b) => (a.editor.id === subjectId ? -1 : b.editor.id === subjectId ? 1 : b.cov.index - a.cov.index || a.editor.name.localeCompare(b.editor.name)));
  const rows = showAll ? allRows : allRows.slice(0, VISIBLE_ROWS);
  const level = confidence(country.evidenceKinds.length);
  const softwareName = (id: string) => ds.software.find((s) => s.id === id)?.name ?? id;

  return (
    <section className="panel" aria-labelledby="panel-title">
      <header className="panelhead">
        <h2 id="panel-title">{country.name}</h2>
        <span className={`badge conf-${level}`} title={country.evidenceKinds.map((k) => k.label).join(' · ')}>
          {level} confidence · {country.evidenceKinds.length} kind{country.evidenceKinds.length > 1 ? 's' : ''} of evidence
        </span>
      </header>

      <dl className="facts">
        <div>
          <dt>Who picks the accounting software</dt>
          <dd>
            <strong>{CHANNEL[country.channel.value]}</strong>
            <span>{country.channel.explanation}</span>
          </dd>
        </div>
        <div>
          <dt>E-invoicing reform</dt>
          <dd>
            <strong>{country.reform.summary}</strong>
            <span>{country.reform.network}</span>
          </dd>
        </div>
        {country.note && (
          <div>
            <dt>Worth knowing</dt>
            <dd><span>{country.note.text}</span></dd>
          </div>
        )}
      </dl>

      {subjectId && result && (
        <div className="you" role="region" aria-label="Your position">
          <div className="youhead">
            <div>
              <span className="eyebrow">{subjectName}</span>
              <strong className="big">{result.coverage}<small>/100</small></strong>
              <span className="muted">
                coverage index · {allRows.length > 1 ? `competitor average ${result.competitorAverage}` : 'no competitor of the dataset is active here'}
              </span>
            </div>
          </div>
          {result.gaps.length > 0 ? (
            <ul className="gaps">
              {result.gaps.slice(0, 5).map((g) => (
                <li key={g.softwareId}>
                  <strong>{softwareName(g.softwareId)}</strong> ({g.importance} here):{' '}
                  <strong>{g.competitorsConnected} of your {g.competitorsTotal} competitors</strong> have it. No public trace on your side.
                </li>
              ))}
              {result.gaps.length > 5 && (
                <li className="muted">
                  And {result.gaps.length - 5} more, ranked in the <a href="#report">full report</a>.
                </li>
              )}
            </ul>
          ) : (
            <p className="muted">
              {allRows.length - 1 < MIN_PEERS
                ? `No gap flagged in ${country.name}: fewer than ${MIN_PEERS} competitors of the dataset are active here, too few to compare.`
                : `No gap flagged in ${country.name}: no software here is reached by half of your competitors and missing on your side.`}
            </p>
          )}
          {result.halfCredit.length > 0 && (
            <p className="muted">
              Counted for half: {result.halfCredit.map(softwareName).join(', ')}. File export, or connection type not stated on your pages.
            </p>
          )}
        </div>
      )}

      <div className="matrixwrap">
        <div className="matrixtitle">
          <h3>Who connects to what</h3>
          <span className="muted">{categoryLabel}: {vendorCount} vendor{vendorCount === 1 ? '' : 's'} active here × {software.length} accounting software · collected {fmtDate(collectedAt)}</span>
        </div>
        <div className="scroll" tabIndex={0} role="region" aria-label="Connection matrix, scrollable">
          <table className="matrix">
            <thead>
              <tr>
                <th scope="col" className="corner">Vendor</th>
                <th scope="col" className="covcol">Index</th>
                {software.map((s) => (
                  <th key={s.id} scope="col" title={`${s.name}: ${s.importance}. ${s.evidence}`}>
                    <span className="colname">{s.name}</span>
                    <span className={`tier tier-${s.importance}`}>{s.importance}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ editor, cov }) => (
                <tr key={editor.id} className={editor.id === subjectId ? 'me' : undefined}>
                  <th scope="row">
                    {editor.name}
                    {editor.id === subjectId && <span className="tag">you</span>}
                  </th>
                  <td className="covcol">
                    <span className="bar"><i style={{ width: `${cov.index}%` }} /></span>
                    <b>{cov.index}</b>
                  </td>
                  {software.map((s) => {
                    const c = findConnection(ds, editor.id, s.id);
                    const on = cell?.editorId === editor.id && cell.softwareId === s.id;
                    return (
                      <td key={s.id}>
                        <button
                          type="button"
                          className={`cell${on ? ' on' : ''}`}
                          aria-label={`${editor.name} and ${s.name}: ${cellLabel(c)}`}
                          title={c ? `${cellLabel(c)}. Source: ${c.sourceUrl}` : 'Not found publicly'}
                          onClick={() => setCell({ editorId: editor.id, softwareId: s.id })}
                          onMouseEnter={() => setCell({ editorId: editor.id, softwareId: s.id })}
                          onFocus={() => setCell({ editorId: editor.id, softwareId: s.id })}
                        >
                          <CellGlyph connection={c} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="avg">
                <th scope="row">Average of {vendorCount}</th>
                <td className="covcol">
                  <span className="bar"><i style={{ width: `${average}%` }} /></span>
                  <b>{average}</b>
                </td>
                <td colSpan={software.length} />
              </tr>
            </tbody>
          </table>
        </div>
        {allRows.length > VISIBLE_ROWS && (
          <button type="button" className="link more" onClick={() => setShowAll(!showAll)}>
            {showAll ? `Show the top ${VISIBLE_ROWS} only` : `Show all ${allRows.length} vendors`}
          </button>
        )}
        {vendorCount === 0 && (
          <p className="muted small">No {categoryLabel.toLowerCase()} vendor of our dataset is active in {country.name} yet.</p>
        )}
        <Legend />
        <CellDetail
          cell={cell}
          connection={cell ? findConnection(ds, cell.editorId, cell.softwareId) : undefined}
          editorName={cell ? ds.editors.find((e) => e.id === cell.editorId)?.name ?? '' : ''}
          softwareName={cell ? softwareName(cell.softwareId) : ''}
        />
      </div>

      {measure && <MeasureBars measure={measure} levels={Object.fromEntries(software.map((x) => [x.id, x.importance]))} />}
    </section>
  );
}

function CellDetail({ cell, connection, editorName, softwareName }: { cell: Cell | null; connection: Connection | undefined; editorName: string; softwareName: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<string | null>(null);

  if (!cell) return <p className="detail muted">Hover or select a cell to see its source and date.</p>;

  const send = async () => {
    const res = await fetch('/api/correction', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ editorId: cell.editorId, softwareId: cell.softwareId, message }),
    });
    setSent(res.ok ? 'Thank you. A person reviews every correction before the data changes.' : 'Please describe the error in a few words.');
    if (res.ok) {
      setMessage('');
      setOpen(false);
    }
  };

  return (
    <div className="detail" aria-live="polite">
      <p>
        <strong>{editorName} × {softwareName}:</strong> {cellLabel(connection)}.{' '}
        {connection ? (
          <>
            {connection.evidence}{' '}
            <a href={connection.sourceUrl} target="_blank" rel="noreferrer">Source</a>
            {connection.confirmedBy && connection.confirmedBy !== connection.sourceUrl && (
              <>
                {' '}· <a href={connection.confirmedBy} target="_blank" rel="noreferrer">{connection.status === 'directory' ? 'connect-compta' : 'Marketplace listing'}</a>
              </>
            )}
            {' '}· collected {fmtDate(connection.collectedAt)}.
          </>
        ) : (
          <>We found no public page stating this connection. That does not mean it does not exist.</>
        )}{' '}
        <button type="button" className="link" onClick={() => { setOpen(!open); setSent(null); }}>Report an error</button>
      </p>
      {open && (
        <div className="correction">
          <label htmlFor="correction">What should we fix, and where can we check it?</label>
          <textarea id="correction" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
          <button type="button" className="btn small" onClick={send}>Send correction</button>
        </div>
      )}
      {sent && <p className="muted">{sent}</p>}
    </div>
  );
}

// The measure sits next to the survey: where a platform is also an accounting software of the list, its survey level is shown.
function MeasureBars({ measure, levels }: { measure: Measure; levels: Record<string, string> }) {
  const top = measure.rows.slice(0, 8);
  const max = Math.max(...top.map((r) => r.n));
  return (
    <div className="measure">
      <h3>{measure.title}</h3>
      <p className="muted">{measure.method}</p>
      <ol>
        {top.map((r) => (
          <li key={r.name}>
            <span className="mname">
              {r.name}
              {r.softwareId && levels[r.softwareId] && <span className={`tier tier-${levels[r.softwareId]}`}>survey: {levels[r.softwareId]}</span>}
            </span>
            <span className="mbar"><i style={{ width: `${(100 * r.n) / max}%` }} /></span>
            <span className="mval">{((100 * r.n) / measure.base.n).toFixed(1)}%</span>
          </li>
        ))}
      </ol>
      <p className="muted small">
        Share of {measure.base.n.toLocaleString('en-GB')} {measure.base.label}. Compiled {measure.compiledAt}.{' '}
        {measure.source.url ? <a href={measure.source.url} target="_blank" rel="noreferrer">{measure.source.label}</a> : measure.source.label}.
        This measures where e-invoices arrive, not which ledger a company keeps: it is a second opinion next to the survey, and does not enter the index.
      </p>
    </div>
  );
}
