// Leads, outgoing messages, corrections and page reads. SQLite file in V1, Postgres next.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// On Vercel only /tmp is writable, and it lives as long as the instance: fine for a demo, Postgres for production.
const dir = process.env.VERCEL ? '/tmp/benchmark-data' : join(process.cwd(), '.data');
mkdirSync(dir, { recursive: true });

const globalForDb = globalThis as unknown as { benchmarkDb?: DatabaseSync };
const db = (globalForDb.benchmarkDb ??= new DatabaseSync(join(dir, 'benchmark.db')));

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL,
    company_domain TEXT NOT NULL, subject_domain TEXT NOT NULL, category TEXT NOT NULL,
    countries TEXT NOT NULL, consent_at TEXT NOT NULL, consent_text TEXT NOT NULL,
    enrichment TEXT NOT NULL, score TEXT NOT NULL, route TEXT NOT NULL, route_reason TEXT NOT NULL,
    priority_gaps INTEGER NOT NULL, clicked_expert INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id TEXT NOT NULL, created_at TEXT NOT NULL,
    channel TEXT NOT NULL, mode TEXT NOT NULL, payload TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, editor_id TEXT NOT NULL,
    software_id TEXT NOT NULL, message TEXT NOT NULL, email TEXT
  );
  CREATE TABLE IF NOT EXISTS scans (
    domain TEXT PRIMARY KEY, created_at TEXT NOT NULL, result TEXT NOT NULL
  );
`);

export type LeadRow = {
  id: string; created_at: string; email: string; role: string; company_domain: string; subject_domain: string;
  category: string; countries: string; consent_at: string; consent_text: string; enrichment: string; score: string;
  route: string; route_reason: string; priority_gaps: number; clicked_expert: number;
};
export type OutboxRow = { id: number; lead_id: string; created_at: string; channel: string; mode: string; payload: string };
export type CorrectionRow = { id: number; created_at: string; editor_id: string; software_id: string; message: string; email: string | null };

const now = () => new Date().toISOString();

export const store = {
  insertLead(lead: Omit<LeadRow, 'created_at' | 'clicked_expert'>) {
    db.prepare(
      `INSERT INTO leads (id, created_at, email, role, company_domain, subject_domain, category, countries, consent_at,
        consent_text, enrichment, score, route, route_reason, priority_gaps)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(lead.id, now(), lead.email, lead.role, lead.company_domain, lead.subject_domain, lead.category, lead.countries,
      lead.consent_at, lead.consent_text, lead.enrichment, lead.score, lead.route, lead.route_reason, lead.priority_gaps);
  },
  getLead(id: string) {
    return db.prepare('SELECT * FROM leads WHERE id = ?').get(id) as LeadRow | undefined;
  },
  findLeadByEmail(email: string) {
    return db.prepare('SELECT * FROM leads WHERE email = ? ORDER BY created_at DESC').get(email) as LeadRow | undefined;
  },
  updateLeadScore(id: string, patch: { score: string; route: string; route_reason: string; clicked_expert: number }) {
    db.prepare('UPDATE leads SET score = ?, route = ?, route_reason = ?, clicked_expert = ? WHERE id = ?')
      .run(patch.score, patch.route, patch.route_reason, patch.clicked_expert, id);
  },
  listLeads() {
    return db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 200').all() as LeadRow[];
  },
  deleteLead(id: string) {
    db.prepare('DELETE FROM outbox WHERE lead_id = ?').run(id);
    db.prepare('DELETE FROM leads WHERE id = ?').run(id);
  },
  addOutbox(leadId: string, channel: string, mode: 'mock' | 'live', payload: unknown) {
    db.prepare('INSERT INTO outbox (lead_id, created_at, channel, mode, payload) VALUES (?, ?, ?, ?, ?)')
      .run(leadId, now(), channel, mode, JSON.stringify(payload));
  },
  listOutbox() {
    return db.prepare('SELECT * FROM outbox ORDER BY id DESC LIMIT 500').all() as OutboxRow[];
  },
  addCorrection(c: { editorId: string; softwareId: string; message: string; email: string | null }) {
    db.prepare('INSERT INTO corrections (created_at, editor_id, software_id, message, email) VALUES (?, ?, ?, ?, ?)')
      .run(now(), c.editorId, c.softwareId, c.message, c.email);
  },
  listCorrections() {
    return db.prepare('SELECT * FROM corrections ORDER BY id DESC LIMIT 200').all() as CorrectionRow[];
  },
  getScan(domain: string) {
    const row = db.prepare('SELECT * FROM scans WHERE domain = ?').get(domain) as { result: string; created_at: string } | undefined;
    return row ? { createdAt: row.created_at, result: JSON.parse(row.result) } : undefined;
  },
  saveScan(domain: string, result: unknown) {
    db.prepare('INSERT OR REPLACE INTO scans (domain, created_at, result) VALUES (?, ?, ?)').run(domain, now(), JSON.stringify(result));
  },
};
