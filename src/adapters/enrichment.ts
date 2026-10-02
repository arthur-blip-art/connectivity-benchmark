import fixture from '@data/enrichment-fixture.json';
import type { CompanyProfile } from './types';

type FixtureRow = { domain: string; name: string; employees: number | null; industry: string | null; hq: string | null; source: string };

// Simulated provider: answers from a fixture file, and says so in `source`.
// A live provider (Clay, FullEnrich) only has to return the same CompanyProfile.
export async function enrichCompany(domain: string): Promise<CompanyProfile> {
  const row = (fixture as FixtureRow[]).find((r) => r.domain === domain);
  if (row) return { ...row };
  return { domain, name: null, employees: null, industry: null, hq: null, source: 'not in the enrichment fixture (simulated mode)' };
}
