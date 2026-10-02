'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CountryCode } from '@/lib/schema';
import { CONSENT_TEXT } from '@/lib/consent';

type Props = {
  category: string;
  countries: CountryCode[];
  countryNames: string[];
  domain: string;
  subjectName: string | null;
  gapCount: number;
};

export function ReportForm({ category, countries, countryNames, domain, subjectName, gapCount }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, role, consent, category, countries, domain: domain || undefined }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'Something went wrong. Nothing was saved.');
      return;
    }
    router.push(json.reportUrl);
  };

  return (
    <section className="reportcta" id="report" aria-labelledby="report-title">
      <div>
        <h2 id="report-title">Get the full report</h2>
        <p>
          {subjectName
            ? gapCount > 0
              ? `${subjectName}: ${gapCount} priority connector${gapCount > 1 ? 's' : ''} missing across ${countryNames.join(', ')}.`
              : `${subjectName} across ${countryNames.join(', ')}.`
            : `Your position across ${countryNames.join(', ')}.`}{' '}
          The report ranks the missing connectors, gives a playbook per country, an order of magnitude of the build cost, and every source.
        </p>
      </div>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="email">Work email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={error ? 'form-error' : undefined} />
        </div>
        <div className="field">
          <label htmlFor="role">Your role</label>
          <input id="role" type="text" autoComplete="organization-title" placeholder="Head of Partnerships" value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{CONSENT_TEXT}</span>
        </label>
        {error && <p id="form-error" className="error" role="alert">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Building your report…' : 'Get the full report'}</button>
      </form>
    </section>
  );
}
