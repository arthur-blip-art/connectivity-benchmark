import type { Connection } from '@/lib/schema';

// Shape says how sure we are: check, square, full dot, half dot, dash.
// Colour says whether a public page puts the connection through Chift (green) or not (dark).
export function cellLabel(c: Connection | undefined): string {
  if (!c) return 'not found publicly';
  const how = c.viaChift
    ? 'through Chift'
    : c.kind === 'file_export' ? 'file export' : c.kind === 'via_partner' ? 'through a partner' : c.kind === 'api' ? 'direct connection' : 'connection type not stated';
  if (c.status === 'confirmed') return `confirmed on the accounting software's marketplace (${how})`;
  if (c.status === 'directory') return `listed in connect-compta, Chift's directory (${how})`;
  return `declared by the vendor (${how})`;
}

export function CellGlyph({ connection }: { connection: Connection | undefined }) {
  if (!connection) {
    return (
      <svg viewBox="0 0 20 20" className="glyph none" aria-hidden="true">
        <line x1="6" y1="10" x2="14" y2="10" />
      </svg>
    );
  }
  const chift = connection.viaChift ? ' chift' : '';
  if (connection.status === 'confirmed') {
    return (
      <svg viewBox="0 0 20 20" className={`glyph confirmed${chift}`} aria-hidden="true">
        <circle cx="10" cy="10" r="8" className="mark" />
        <path d="M6 10.3l2.7 2.7 5.3-5.6" />
      </svg>
    );
  }
  if (connection.status === 'directory') {
    return (
      <svg viewBox="0 0 20 20" className={`glyph directory${chift}`} aria-hidden="true">
        <rect x="3.5" y="3.5" width="13" height="13" rx="3.5" className="mark" />
      </svg>
    );
  }
  if (connection.kind === 'file_export' || connection.kind === 'unknown') {
    return (
      <svg viewBox="0 0 20 20" className={`glyph export${chift}`} aria-hidden="true">
        <circle cx="10" cy="10" r="6.5" className="outline" />
        <path d="M10 3.5a6.5 6.5 0 0 0 0 13z" className="mark" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className={`glyph declared${chift}`} aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" className="mark" />
    </svg>
  );
}

const sample = (status: Connection['status'], kind: Connection['kind'], viaChift = false) =>
  ({ status, kind, viaChift } as Connection);

export function Legend() {
  return (
    <ul className="legend" aria-label="Legend">
      <li><CellGlyph connection={sample('confirmed', 'api')} /> Confirmed on the software&apos;s marketplace</li>
      <li><CellGlyph connection={sample('directory', 'api')} /> Listed in connect-compta, Chift&apos;s directory</li>
      <li><CellGlyph connection={sample('declared', 'api')} /> Declared by the vendor</li>
      <li><CellGlyph connection={sample('declared', 'file_export')} /> File export, or type not stated (counts half)</li>
      <li><CellGlyph connection={sample('directory', 'via_partner', true)} /> Green: runs through Chift</li>
      <li><CellGlyph connection={undefined} /> Not found publicly</li>
    </ul>
  );
}
