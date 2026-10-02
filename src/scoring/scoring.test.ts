import { describe, expect, it } from 'vitest';
import type { Connection, Dataset, Editor, Market, Software } from '@/lib/schema';
import { averageCoverage, confidence, coverage, credit, estimatedCost, gaps, halfCredit } from './index';
import { emailDomain, isFreeMail, routeLead, scoreLead } from './lead';

const editor = (id: string): Editor => ({
  id, name: id, domain: `${id}.com`, category: 'expense', hq: 'FR', integrationsUrl: null, markets: ['DE'], unreadable: [],
});
const software = (id: string): Software => ({ id, name: id, vendor: id, target: 'both', url: null, marketplaceUrl: null, aliases: [], cased: false });
const market = (softwareId: string, importance: Market['importance']): Market => ({
  country: 'DE', softwareId, importance, evidence: 'test', sources: ['https://example.com'],
});
const link = (editorId: string, softwareId: string, kind: Connection['kind'] = 'api'): Connection => ({
  editorId, softwareId, status: 'declared', kind, sourceUrl: 'https://example.com/integrations',
  evidence: 'test', viaChift: false, confirmedBy: null, collectedAt: '2026-10-01',
});

// Germany in miniature: DATEV dominant, Lexware important, sevdesk secondary. Seven editors.
function germany(connections: Connection[]): Dataset {
  return {
    editors: ['me', 'a', 'b', 'c', 'd', 'e', 'f'].map(editor),
    software: ['datev', 'lexware', 'sevdesk'].map(software),
    markets: [market('datev', 'dominant'), market('lexware', 'important'), market('sevdesk', 'secondary')],
    connections,
  };
}

describe('coverage index', () => {
  it('is 100 when the editor is connected to every software of the country', () => {
    const ds = germany([link('me', 'datev'), link('me', 'lexware'), link('me', 'sevdesk')]);
    expect(coverage(ds, 'me', 'DE')).toEqual({ index: 100, connected: 3, total: 3 });
  });

  it('is 0 when no connection was found publicly', () => {
    expect(coverage(germany([]), 'me', 'DE')).toEqual({ index: 0, connected: 0, total: 3 });
  });

  it('weights software by importance level', () => {
    // DATEV alone: 3 of 6 weight points.
    expect(coverage(germany([link('me', 'datev')]), 'me', 'DE').index).toBe(50);
    // sevdesk alone: 1 of 6.
    expect(coverage(germany([link('me', 'sevdesk')]), 'me', 'DE').index).toBe(17);
  });

  it('counts a file export, or an unstated connection type, for half', () => {
    const ds = germany([link('me', 'datev', 'file_export'), link('me', 'lexware', 'unknown')]);
    expect(coverage(ds, 'me', 'DE').index).toBe(42); // (1.5 + 1) of 6
    expect(halfCredit(ds, 'me', 'DE').map((c) => c.softwareId)).toEqual(['datev', 'lexware']);
  });

  it('gives full credit once a second source backs the connection, whatever the stated type', () => {
    expect(credit({ ...link('me', 'datev', 'unknown'), status: 'confirmed' })).toBe(1);
    expect(credit({ ...link('me', 'datev', 'unknown'), status: 'directory' })).toBe(1);
    expect(credit(link('me', 'datev', 'via_partner'))).toBe(1);
    expect(credit(undefined)).toBe(0);
  });

  it('averages the category without the visitor', () => {
    const ds = germany([link('a', 'datev'), link('a', 'lexware'), link('a', 'sevdesk')]);
    expect(averageCoverage(ds, 'DE', 'expense', 'me')).toBe(17); // one editor at 100, five at 0
  });
});

describe('competitive gaps', () => {
  it('flags DATEV when 4 of 6 competitors are connected and the editor is not', () => {
    const ds = germany(['a', 'b', 'c', 'd'].map((id) => link(id, 'datev')));
    const [gap] = gaps(ds, 'me', 'DE');
    expect(gap.softwareId).toBe('datev');
    expect(gap.competitorsConnected).toBe(4);
    expect(gap.competitorsTotal).toBe(6);
    expect(gap.priority).toBe(5); // 3 x (1 + 0.67), rounded to two decimals
  });

  it('only counts competitors of the same category that are active in the country', () => {
    const ds = germany(['a', 'b', 'c', 'd'].map((id) => link(id, 'datev')));
    ds.editors.find((e) => e.id === 'e')!.markets = ['FR']; // not active in Germany
    ds.editors.find((e) => e.id === 'f')!.category = 'banking'; // another vertical
    const [gap] = gaps(ds, 'me', 'DE');
    expect(gap.competitorsConnected).toBe(4);
    expect(gap.competitorsTotal).toBe(4);
    expect(gap.priority).toBe(6); // 3 x (1 + 1)
  });

  it('flags nothing when fewer than three competitors are active in the country', () => {
    const ds = germany(['a', 'b'].map((id) => link(id, 'datev')));
    for (const id of ['c', 'd', 'e', 'f']) ds.editors.find((e) => e.id === id)!.markets = ['FR'];
    expect(gaps(ds, 'me', 'DE')).toEqual([]);
  });

  it('does not flag a software that fewer than half of competitors have', () => {
    const ds = germany(['a', 'b'].map((id) => link(id, 'lexware')));
    expect(gaps(ds, 'me', 'DE')).toEqual([]);
  });

  it('does not flag a software the editor already has', () => {
    const ds = germany([...['a', 'b', 'c', 'd'].map((id) => link(id, 'datev')), link('me', 'datev')]);
    expect(gaps(ds, 'me', 'DE')).toEqual([]);
  });

  it('sorts gaps by priority, highest first', () => {
    const ds = germany([
      ...['a', 'b', 'c'].map((id) => link(id, 'sevdesk')),
      ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => link(id, 'datev')),
    ]);
    expect(gaps(ds, 'me', 'DE').map((g) => g.softwareId)).toEqual(['datev', 'sevdesk']);
  });
});

describe('confidence and cost', () => {
  it('is low with a single kind of evidence, medium with two, high with three', () => {
    expect(confidence(1)).toBe('low');
    expect(confidence(2)).toBe('medium');
    expect(confidence(3)).toBe('high');
  });

  it('multiplies priority gaps by the unit cost range', () => {
    expect(estimatedCost(3, { low: 10_000, high: 25_000 })).toEqual({ low: 30_000, high: 75_000 });
  });
});

describe('lead score', () => {
  const base = { isCategoryEditor: true, employees: 220, priorityGaps: 3, role: 'Head of Partnerships', clickedExpert: false, countriesViewed: 3 };

  it('gives 95 to a senior contact at a mid-size category editor with gaps', () => {
    expect(scoreLead(base).total).toBe(95);
  });

  it('reaches 100 once the contact clicks "Talk to an expert"', () => {
    expect(scoreLead({ ...base, clickedExpert: true }).total).toBe(100);
  });

  it('stays low for an unknown company and a junior role', () => {
    expect(scoreLead({ isCategoryEditor: false, employees: null, priorityGaps: 0, role: 'Intern', clickedExpert: false, countriesViewed: 1 }).total).toBe(0);
  });
});

describe('routing', () => {
  const thresholds = { aeThreshold: 70, nurtureThreshold: 40 };

  it('sends an existing customer to the CSM whatever the score', () => {
    expect(routeLead({ isChiftCustomer: true, isChiftCompetitor: false, score: 95 }, thresholds).route).toBe('csm');
    expect(routeLead({ isChiftCustomer: true, isChiftCompetitor: false, score: 5 }, thresholds).route).toBe('csm');
  });

  it('keeps competitors out of sales routing', () => {
    expect(routeLead({ isChiftCustomer: false, isChiftCompetitor: true, score: 95 }, thresholds).route).toBe('excluded');
  });

  it('routes by score otherwise', () => {
    const r = (score: number) => routeLead({ isChiftCustomer: false, isChiftCompetitor: false, score }, thresholds).route;
    expect(r(80)).toBe('ae');
    expect(r(70)).toBe('ae');
    expect(r(69)).toBe('nurture');
    expect(r(40)).toBe('nurture');
    expect(r(39)).toBe('newsletter');
  });
});

describe('email checks', () => {
  it('extracts the domain and refuses consumer mailboxes', () => {
    expect(emailDomain('Jane.Doe@Pleo.io')).toBe('pleo.io');
    expect(emailDomain('not-an-email')).toBeNull();
    expect(isFreeMail('gmail.com')).toBe(true);
    expect(isFreeMail('pleo.io')).toBe(false);
  });
});
