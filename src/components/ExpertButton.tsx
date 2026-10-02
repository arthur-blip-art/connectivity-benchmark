'use client';

import { useState } from 'react';

export function ExpertButton({ leadId }: { leadId: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [url, setUrl] = useState<string | null>(null);

  const click = async () => {
    setState('busy');
    const res = await fetch('/api/intent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ leadId }) });
    const json = await res.json().catch(() => ({}));
    setUrl(json.bookingUrl ?? 'https://www.chift.eu/contact');
    setState('done');
  };

  if (state === 'done') {
    return (
      <p role="status">
        Noted. <a className="btn primary" href={url!} target="_blank" rel="noreferrer">Pick a slot</a>
      </p>
    );
  }
  return (
    <button type="button" className="btn primary" onClick={click} disabled={state === 'busy'}>
      Talk to a Chift expert
    </button>
  );
}
