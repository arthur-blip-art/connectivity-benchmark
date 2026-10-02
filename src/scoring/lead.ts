// Lead score and routing. Pure functions: the API route feeds them, tests cover them.

export type LeadSignals = {
  isCategoryEditor: boolean; // in the benchmark, or its public page names accounting software
  employees: number | null;
  priorityGaps: number; // missing connectors that at least half of competitors have
  role: string;
  clickedExpert: boolean;
  countriesViewed: number;
};

export type ScoreLine = { criterion: string; points: number; max: number; why: string };
export type LeadScore = { total: number; lines: ScoreLine[] };

const SENIOR = /\b(c[eotp]o|cfo|coo|chief|founder|co-?founder|vp|vice president|head of|director|directeur|directrice)\b/i;

export function isSenior(role: string) {
  return SENIOR.test(role);
}

export function scoreLead(s: LeadSignals): LeadScore {
  const inBand = s.employees !== null && s.employees >= 50 && s.employees <= 500;
  const fit = (s.isCategoryEditor ? 25 : 0) + (inBand ? 15 : 0);
  const lines: ScoreLine[] = [
    {
      criterion: 'Fit',
      points: fit,
      max: 40,
      why:
        `${s.isCategoryEditor ? 'software vendor with public accounting integrations' : 'not identified as a software vendor with accounting integrations'}; ` +
        (s.employees === null ? 'size unknown' : `${s.employees} employees${inBand ? ' (50 to 500)' : ' (outside 50 to 500)'}`),
    },
    {
      criterion: 'Gap',
      points: s.priorityGaps >= 2 ? 25 : s.priorityGaps === 1 ? 12 : 0,
      max: 25,
      why: `${s.priorityGaps} priority connector${s.priorityGaps === 1 ? '' : 's'} missing`,
    },
    {
      criterion: 'Seniority',
      points: isSenior(s.role) ? 20 : 0,
      max: 20,
      why: s.role ? `role: ${s.role}` : 'no role given',
    },
    {
      criterion: 'Intent',
      points: s.clickedExpert ? 15 : s.countriesViewed >= 2 ? 10 : 0,
      max: 15,
      why: s.clickedExpert
        ? 'clicked "Talk to a Chift expert"'
        : `${s.countriesViewed} countr${s.countriesViewed === 1 ? 'y' : 'ies'} selected`,
    },
  ];
  return { total: lines.reduce((sum, l) => sum + l.points, 0), lines };
}

export type Route = 'csm' | 'ae' | 'nurture' | 'newsletter' | 'excluded';

export function routeLead(
  input: { isChiftCustomer: boolean; isChiftCompetitor: boolean; score: number },
  thresholds: { aeThreshold: number; nurtureThreshold: number },
): { route: Route; reason: string } {
  // Existing customers go to their CSM before any score is read: never into prospecting.
  if (input.isChiftCustomer) return { route: 'csm', reason: 'existing Chift customer: expansion signal for the CSM' };
  if (input.isChiftCompetitor) return { route: 'excluded', reason: 'competitor domain: report delivered, no sales routing' };
  if (input.score >= thresholds.aeThreshold) return { route: 'ae', reason: `score ${input.score} at or above ${thresholds.aeThreshold}` };
  if (input.score >= thresholds.nurtureThreshold) return { route: 'nurture', reason: `score ${input.score} between ${thresholds.nurtureThreshold} and ${thresholds.aeThreshold - 1}` };
  return { route: 'newsletter', reason: `score ${input.score} below ${thresholds.nurtureThreshold}` };
}

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr', 'live.com', 'live.fr',
  'yahoo.com', 'yahoo.fr', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'gmx.de', 'gmx.net', 'web.de',
  'orange.fr', 'free.fr', 'laposte.net', 'sfr.fr', 'wanadoo.fr', 'telenet.be', 'skynet.be', 'aol.com', 't-online.de',
]);

export function emailDomain(email: string): string | null {
  const m = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(email.trim().toLowerCase());
  return m ? m[1] : null;
}

export function isFreeMail(domain: string) {
  return FREE_MAIL.has(domain.toLowerCase());
}
