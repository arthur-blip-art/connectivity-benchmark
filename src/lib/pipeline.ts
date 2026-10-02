// A report request becomes a lead: validated, enriched, scored, routed, stored. Server only.
import { randomUUID } from 'node:crypto';
import { chift, countries, dataset, settings } from './data';
import { benchmark, cleanDomain, countPriorityGaps, findEditor, withSubject, type CountryResult, type Subject } from './benchmark';
import type { CountryCode } from './schema';
import { store, type LeadRow } from './store';
import { emailDomain, isFreeMail, routeLead, scoreLead, type LeadScore, type Route } from '@/scoring/lead';
import { enrichCompany } from '@/adapters/enrichment';
import { notifySlack } from '@/adapters/slack';
import { upsertCrm } from '@/adapters/crm';
import { sendReportEmail } from '@/adapters/email';
import type { CompanyProfile, LeadSummary } from '@/adapters/types';
import { CONSENT_TEXT } from './consent';

export class LeadError extends Error {
  constructor(public field: string, message: string) {
    super(message);
  }
}

export function resolveSubject(domain: string): Subject {
  const d = cleanDomain(domain);
  const editor = findEditor(dataset, d);
  if (editor) return { kind: 'editor', editorId: editor.id, domain: editor.domain };
  const scan = store.getScan(d);
  if (scan) return { kind: 'scanned', domain: d, connections: scan.result.connections, pageUrl: scan.result.pageUrl };
  return { kind: 'unknown', domain: d };
}

export function computeFor(subject: Subject, codes: CountryCode[], category: string) {
  const { ds, editorId, category: used } = withSubject(dataset, subject, category);
  return { ds, editorId, category: used, results: benchmark(ds, editorId, codes, settings.gapMinCompetitorShare) };
}

const softwareName = (id: string) => dataset.software.find((s) => s.id === id)?.name ?? id;
const countryName = (code: string) => countries.find((c) => c.code === code)?.name ?? code;
const matches = (list: { domain: string }[], domain: string) => list.some((a) => domain === a.domain || domain.endsWith(`.${a.domain}`));

function summary(lead: LeadRow, company: CompanyProfile, score: LeadScore, results: CountryResult[], origin: string): LeadSummary {
  const seen = new Set<string>();
  const gaps = results.flatMap((r) => r.gaps).filter((g) => !seen.has(g.softwareId) && seen.add(g.softwareId));
  return {
    leadId: lead.id,
    email: lead.email,
    role: lead.role,
    company,
    score: score.total,
    route: lead.route,
    routeReason: lead.route_reason,
    countries: (JSON.parse(lead.countries) as string[]).map(countryName),
    gaps: gaps.map((g) => ({ software: softwareName(g.softwareId), competitorsConnected: g.competitorsConnected, competitorsTotal: g.competitorsTotal })),
    reportUrl: `${origin}${reportPath(lead)}`,
  };
}

// The report link carries what the report is computed from (never the email), so it still opens on a host whose
// lead store does not persist between instances.
export function reportPath(lead: { id: string; subject_domain: string; countries: string; category: string }) {
  const query = new URLSearchParams({ d: lead.subject_domain, c: (JSON.parse(lead.countries) as string[]).join(','), k: lead.category });
  return `/report/${lead.id}?${query}`;
}

async function dispatch(route: Route, s: LeadSummary, alreadyKnown: boolean) {
  if (route === 'ae') {
    const slack = await notifySlack(s, 'ae');
    store.addOutbox(s.leadId, 'slack', slack.mode, slack.payload);
    const crm = await upsertCrm(s, alreadyKnown);
    store.addOutbox(s.leadId, 'crm', crm.mode, crm.payload);
  } else if (route === 'csm') {
    const slack = await notifySlack(s, 'csm');
    store.addOutbox(s.leadId, 'slack', slack.mode, slack.payload);
  } else if (route === 'nurture') {
    store.addOutbox(s.leadId, 'nurture', 'mock', { sequence: `e-invoicing reform, ${s.countries.join(' + ')}`, note: 'enrolled in the country nurture sequence' });
  } else if (route === 'newsletter') {
    store.addOutbox(s.leadId, 'newsletter', 'mock', { list: 'newsletter' });
  }
}

export async function processLead(input: {
  email: string; role: string; consent: boolean; category: string; countries: CountryCode[]; domain?: string; origin: string;
}) {
  const email = input.email.trim().toLowerCase();
  const companyDomain = emailDomain(email);
  if (!companyDomain) throw new LeadError('email', 'This does not look like an email address.');
  if (isFreeMail(companyDomain)) {
    throw new LeadError('email', 'Please use your work email. The report compares your company with its competitors, so we need its domain.');
  }
  if (!input.consent) throw new LeadError('consent', 'We need your consent to send the report.');
  if (input.countries.length === 0 || input.countries.length > 3) throw new LeadError('countries', 'Pick one to three countries.');

  // The benchmark is about the domain typed on the page, or the company behind the email.
  const subjectDomain = input.domain ? cleanDomain(input.domain) : companyDomain;
  const subject = resolveSubject(subjectDomain);
  if (!settings.categories.some((c) => c.id === input.category)) throw new LeadError('category', 'Unknown category.');
  const { results, category } = computeFor(subject, input.countries, input.category);
  // A domain we know nothing about has no measured gap: its empty row must not earn gap points.
  const priorityGaps = subject.kind === 'unknown' ? 0 : countPriorityGaps(results);

  const company = await enrichCompany(companyDomain);
  const isCategoryEditor = !!findEditor(dataset, companyDomain) || subject.kind === 'scanned';
  const score = scoreLead({
    isCategoryEditor, employees: company.employees, priorityGaps, role: input.role.trim(),
    clickedExpert: false, countriesViewed: input.countries.length,
  });
  const routed = routeLead(
    { isChiftCustomer: matches(chift.customers, companyDomain), isChiftCompetitor: matches(chift.competitors, companyDomain), score: score.total },
    settings.routing,
  );

  const alreadyKnown = !!store.findLeadByEmail(email);
  const id = randomUUID();
  store.insertLead({
    id, email, role: input.role.trim(), company_domain: companyDomain, subject_domain: subjectDomain, category,
    countries: JSON.stringify(input.countries), consent_at: new Date().toISOString(), consent_text: CONSENT_TEXT,
    enrichment: JSON.stringify(company), score: JSON.stringify(score), route: routed.route, route_reason: routed.reason,
    priority_gaps: priorityGaps,
  });
  const lead = store.getLead(id)!;
  const s = summary(lead, company, score, results, input.origin);
  const mail = await sendReportEmail(email, s.reportUrl);
  store.addOutbox(id, 'email', mail.mode, mail.payload);
  await dispatch(routed.route, s, alreadyKnown);
  return { id, reportUrl: reportPath(lead) };
}

// "Talk to a Chift expert" is the strongest intent signal: rescore, and alert the AE if the lead crosses the bar.
export async function registerExpertClick(leadId: string, origin: string) {
  const lead = store.getLead(leadId);
  if (!lead || lead.clicked_expert) return;
  const company = JSON.parse(lead.enrichment) as CompanyProfile;
  const codes = JSON.parse(lead.countries) as CountryCode[];
  const subject = resolveSubject(lead.subject_domain);
  const { results } = computeFor(subject, codes, lead.category);
  const score = scoreLead({
    isCategoryEditor: !!findEditor(dataset, lead.company_domain) || subject.kind === 'scanned',
    employees: company.employees, priorityGaps: lead.priority_gaps, role: lead.role, clickedExpert: true, countriesViewed: codes.length,
  });
  const routed = routeLead(
    { isChiftCustomer: matches(chift.customers, lead.company_domain), isChiftCompetitor: matches(chift.competitors, lead.company_domain), score: score.total },
    settings.routing,
  );
  store.updateLeadScore(leadId, { score: JSON.stringify(score), route: routed.route, route_reason: routed.reason, clicked_expert: 1 });
  store.addOutbox(leadId, 'intent', 'mock', { event: 'clicked "Talk to a Chift expert"', newScore: score.total });
  if (routed.route !== lead.route) {
    const updated = store.getLead(leadId)!;
    await dispatch(routed.route, summary(updated, company, score, results, origin), true);
  }
}
