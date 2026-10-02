import { MOCK_MODE, type Delivery, type LeadSummary } from './types';

// Three lines: company, countries, gaps. The AE validates before any contact.
export function slackText(lead: LeadSummary, audience: 'ae' | 'csm'): string {
  const c = lead.company;
  const size = c.employees ? `${c.employees} employees` : 'size unknown';
  const gaps = lead.gaps.length
    ? lead.gaps.slice(0, 4).map((g) => `${g.software} (${g.competitorsConnected} of ${g.competitorsTotal} competitors)`).join(', ')
    : 'none flagged';
  const head = audience === 'csm'
    ? `Existing customer exploring new countries: ${c.name ?? c.domain}`
    : `Hot lead from the Connectivity Benchmark, score ${lead.score}`;
  return [
    head,
    `Company: ${c.name ?? c.domain} (${c.domain}), ${size}${c.hq ? `, ${c.hq}` : ''}. Contact: ${lead.role || 'role not given'}, ${lead.email}`,
    `Countries: ${lead.countries.join(', ')}`,
    `Missing connectors: ${gaps}`,
    `Report: ${lead.reportUrl}`,
  ].join('\n');
}

export async function notifySlack(lead: LeadSummary, audience: 'ae' | 'csm'): Promise<Delivery> {
  const text = slackText(lead, audience);
  const channel = audience === 'csm' ? '#cs-expansion' : '#sales-hot-leads';
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (MOCK_MODE || !webhook) return { mode: 'mock', payload: { channel, text } };
  const res = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
  return { mode: 'live', payload: { channel, text, status: res.status } };
}
