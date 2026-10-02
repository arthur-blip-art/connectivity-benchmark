'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Connection, Country, CountryCode, Dataset, Settings } from '@/lib/schema';
import type { Measure } from '@/lib/data';
import type { MapShape } from '@/lib/map';
import { benchmark, cleanDomain, findEditor, forCategory, withSubject, type Subject } from '@/lib/benchmark';
import { activeIn, averageCoverage, confidence } from '@/scoring';
import { EuropeMap } from './EuropeMap';
import { CountryPanel } from './CountryPanel';
import { ReportForm } from './ReportForm';

type Props = {
  dataset: Dataset;
  countries: Country[];
  settings: Settings;
  measures: Measure[];
  shapes: MapShape[];
  mapSize: { width: number; height: number };
  initial: { domain: string; countries: CountryCode[]; category: string };
};

type ScanState = { status: 'idle' } | { status: 'reading'; domain: string } | { status: 'error'; message: string };

const MAX_COUNTRIES = 3;

export function Benchmark({ dataset, countries, settings, measures, shapes, mapSize, initial }: Props) {
  const [picked, setPicked] = useState(initial.category);
  const [selected, setSelected] = useState<CountryCode[]>(initial.countries);
  const [active, setActive] = useState<CountryCode>(initial.countries[0]);
  const [domainInput, setDomainInput] = useState(initial.domain);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [scan, setScan] = useState<ScanState>({ status: 'idle' });

  const resolve = useCallback(
    async (raw: string) => {
      const domain = cleanDomain(raw);
      if (!domain) {
        setSubject(null);
        setScan({ status: 'idle' });
        return;
      }
      const editor = findEditor(dataset, domain);
      if (editor) {
        setSubject({ kind: 'editor', editorId: editor.id, domain: editor.domain });
        setPicked(editor.category);
        setScan({ status: 'idle' });
        return;
      }
      setScan({ status: 'reading', domain });
      try {
        const res = await fetch(`/api/scan?domain=${encodeURIComponent(domain)}`);
        const json = await res.json();
        if (!res.ok) {
          setScan({ status: 'error', message: json.error ?? 'We could not read this domain.' });
          setSubject(null);
          return;
        }
        setSubject(
          json.connections?.length
            ? { kind: 'scanned', domain, connections: json.connections as Connection[], pageUrl: json.pageUrl }
            : { kind: 'unknown', domain },
        );
        setScan({ status: 'idle' });
      } catch {
        setScan({ status: 'error', message: 'We could not reach this domain.' });
        setSubject(null);
      }
    },
    [dataset],
  );

  // A pre-filled link (?domain=pleo.io) opens straight on the visitor's row.
  useEffect(() => {
    if (initial.domain) void resolve(initial.domain);
  }, [initial.domain, resolve]);

  // A known vendor is compared within its own vertical; anyone else within the vertical picked above.
  const view = useMemo(() => {
    if (!subject) return { ds: forCategory(dataset, picked), editorId: null as string | null, category: picked };
    return withSubject(dataset, subject, picked);
  }, [dataset, subject, picked]);

  const category = settings.categories.find((c) => c.id === view.category) ?? settings.categories[0];
  const reference = useMemo(() => forCategory(dataset, view.category), [dataset, view.category]);

  const averages = useMemo(
    () => Object.fromEntries(countries.map((c) => [c.code, averageCoverage(reference, c.code)])) as Record<CountryCode, number>,
    [reference, countries],
  );
  const vendorCounts = useMemo(
    () => Object.fromEntries(countries.map((c) => [c.code, activeIn(reference, c.code).length])) as Record<CountryCode, number>,
    [reference, countries],
  );

  const results = useMemo(
    () => (view.editorId ? benchmark(view.ds, view.editorId, selected, settings.gapMinCompetitorShare) : []),
    [view, selected, settings.gapMinCompetitorShare],
  );

  // A chip first shows its country; pressing the country already shown removes it from the selection.
  const toggle = (code: CountryCode) => {
    if (selected.includes(code) && active !== code) {
      setActive(code);
      return;
    }
    if (selected.includes(code)) {
      const next = selected.filter((c) => c !== code);
      if (next.length === 0) return;
      setSelected(next);
      setActive(next[0]);
      return;
    }
    setSelected([...selected, code].slice(-MAX_COUNTRIES));
    setActive(code);
  };

  const activeCountry = countries.find((c) => c.code === active)!;
  const subjectName = subject
    ? subject.kind === 'editor'
      ? dataset.editors.find((e) => e.id === subject.editorId)!.name
      : subject.domain
    : null;
  const knownVendor = subject?.kind === 'editor';

  return (
    <div className="bench">
      <section className="controls" aria-label="Your benchmark">
        <div className="control">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            value={view.category}
            disabled={knownVendor}
            title={knownVendor ? `${subjectName} is compared within its own category` : undefined}
            onChange={(e) => setPicked(e.target.value)}
          >
            {settings.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({dataset.editors.filter((e) => e.category === c.id).length})
              </option>
            ))}
          </select>
        </div>
        <fieldset className="control">
          <legend>Countries (up to {MAX_COUNTRIES})</legend>
          <div className="chips">
            {countries.map((c) => (
              <button
                key={c.code}
                type="button"
                className="chip"
                aria-pressed={selected.includes(c.code)}
                data-active={active === c.code}
                onClick={() => toggle(c.code)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </fieldset>
        <form
          className="control grow"
          onSubmit={(e) => {
            e.preventDefault();
            void resolve(domainInput);
          }}
        >
          <label htmlFor="domain">Your product&apos;s domain (optional)</label>
          <div className="row">
            <input
              id="domain"
              type="text"
              inputMode="url"
              autoComplete="off"
              placeholder="yourcompany.com"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
            />
            <button type="submit" className="btn" disabled={scan.status === 'reading'}>
              {scan.status === 'reading' ? 'Reading…' : 'Show my gaps'}
            </button>
          </div>
        </form>
      </section>

      <p className="status" role="status" aria-live="polite">
        {scan.status === 'reading' && <>Reading the public integrations pages of {scan.domain}. This takes a few seconds.</>}
        {scan.status === 'error' && <span className="error">{scan.message}</span>}
        {scan.status === 'idle' && subject?.kind === 'scanned' && (
          <>
            {subject.domain} is not in the reviewed dataset. We just read{' '}
            <a href={subject.pageUrl ?? '#'} target="_blank" rel="noreferrer">its public page</a> and found{' '}
            {subject.connections.length} accounting software named there. Automated read, not reviewed.
            Compared with: {category.label.toLowerCase()}.
          </>
        )}
        {scan.status === 'idle' && subject?.kind === 'unknown' && (
          <>We found no public integrations page naming accounting software on {subject.domain}. Your row shows as not found publicly.</>
        )}
      </p>

      <div className="layout">
        <section className="mapcard" aria-label="Map">
          <EuropeMap
            shapes={shapes}
            size={mapSize}
            averages={averages}
            covered={countries.map((c) => c.code)}
            counts={vendorCounts}
            selected={selected}
            active={active}
            confidences={Object.fromEntries(countries.map((c) => [c.code, confidence(c.evidenceKinds.length)])) as Record<CountryCode, string>}
            onPick={(code) => {
              if (!selected.includes(code)) toggle(code);
              else setActive(code);
            }}
          />
          <p className="mapnote">
            Colour: average coverage index of the {category.label.toLowerCase()} vendors active in each country.
            Grey: fewer than three vendors. An index of importance-weighted connections, not a market share.
          </p>
        </section>

        <CountryPanel
          key={`${active}-${view.category}`}
          country={activeCountry}
          ds={view.ds}
          categoryLabel={category.label}
          vendorCount={vendorCounts[active]}
          subjectId={view.editorId}
          subjectName={subjectName}
          result={results.find((r) => r.country === active) ?? null}
          measure={measures.find((m) => m.country === active) ?? null}
          average={averages[active]}
          collectedAt={settings.collectedAt}
        />
      </div>

      <ReportForm
        category={view.category}
        countries={selected}
        countryNames={selected.map((code) => countries.find((c) => c.code === code)!.name)}
        domain={subject?.domain ?? cleanDomain(domainInput)}
        subjectName={subjectName}
        gapCount={new Set(results.flatMap((r) => r.gaps.map((g) => g.softwareId))).size}
      />
    </div>
  );
}
