import { MOCK_MODE, type Delivery, type LeadSummary } from './types';

const HUBSPOT = 'https://api.hubapi.com';

async function hubspot(path: string, method: string, body?: unknown) {
  const res = await fetch(HUBSPOT + path, {
    method,
    headers: { authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HubSpot ${res.status} on ${path}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

// Company found by domain, contact found by email: a second report request never creates a duplicate.
export async function upsertCrm(lead: LeadSummary, alreadyKnown: boolean): Promise<Delivery> {
  const record = {
    company: { domain: lead.company.domain, name: lead.company.name ?? lead.company.domain },
    contact: { email: lead.email, jobtitle: lead.role },
    note: `Connectivity Benchmark: score ${lead.score}, route ${lead.route}. Countries: ${lead.countries.join(', ')}. ` +
      `Missing connectors: ${lead.gaps.map((g) => g.software).join(', ') || 'none flagged'}. Report: ${lead.reportUrl}`,
    dedupe: { company: 'domain', contact: 'email' },
  };
  if (MOCK_MODE || !process.env.HUBSPOT_TOKEN) {
    return { mode: 'mock', payload: { action: alreadyKnown ? 'update' : 'create', ...record } };
  }

  const found = await hubspot('/crm/v3/objects/companies/search', 'POST', {
    filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: record.company.domain }] }],
    properties: ['domain'],
    limit: 1,
  });
  const companyId: string = found.results?.[0]?.id
    ?? (await hubspot('/crm/v3/objects/companies', 'POST', { properties: record.company })).id;
  const contact = await hubspot('/crm/v3/objects/contacts/batch/upsert', 'POST', {
    inputs: [{ id: lead.email, idProperty: 'email', properties: record.contact }],
  });
  const contactId: string = contact.results?.[0]?.id;
  await hubspot(`/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyId}`, 'PUT');
  await hubspot('/crm/v3/objects/notes', 'POST', {
    properties: { hs_note_body: record.note, hs_timestamp: new Date().toISOString() },
    associations: [
      { to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] },
      { to: { id: companyId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 190 }] },
    ],
  });
  return { mode: 'live', payload: { action: found.results?.length ? 'update' : 'create', companyId, contactId, ...record } };
}
