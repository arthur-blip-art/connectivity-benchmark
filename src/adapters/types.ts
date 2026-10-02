// One interface per outside service. Every adapter has a simulated mode, on by default,
// so the whole journey runs without any key. Nothing here decides anything: the pipeline does.

export const MOCK_MODE = process.env.MOCK_MODE !== 'false';

export type CompanyProfile = {
  domain: string;
  name: string | null;
  employees: number | null;
  industry: string | null;
  hq: string | null;
  source: string; // where the figures come from, shown to the AE
};

export type LeadSummary = {
  leadId: string;
  email: string;
  role: string;
  company: CompanyProfile;
  score: number;
  route: string;
  routeReason: string;
  countries: string[];
  gaps: { software: string; competitorsConnected: number; competitorsTotal: number }[];
  reportUrl: string;
};

export type Delivery = { mode: 'mock' | 'live'; payload: unknown };
