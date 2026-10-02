'use client';

import type { CountryCode } from '@/lib/schema';
import type { MapShape } from '@/lib/map';
import { MIN_PEERS } from '@/scoring';

// One hue, light to dark. Steps are fixed so the map darkens as coverage grows.
export const SCALE = [
  { from: 0, color: '#ffffff' },
  { from: 10, color: '#d9f6e4' },
  { from: 20, color: '#a3f3c7' },
  { from: 30, color: '#22d57e' },
  { from: 45, color: '#0e7a4a' },
  { from: 60, color: '#0a2414' },
];

export function colorFor(value: number) {
  return [...SCALE].reverse().find((s) => value >= s.from)!.color;
}

type Props = {
  shapes: MapShape[];
  size: { width: number; height: number };
  averages: Record<CountryCode, number>;
  confidences: Record<CountryCode, string>;
  // Countries that have data. The others stay grey.
  covered: CountryCode[];
  // Vendors of the category active in each country. A country with none shows no figure.
  counts: Record<CountryCode, number>;
  selected: CountryCode[];
  active: CountryCode;
  onPick: (code: CountryCode) => void;
};

// Small countries hold no label: it sits next to them, with a leader line.
const OFFSET: Partial<Record<CountryCode, { dx: number; dy: number }>> = {
  BE: { dx: -38, dy: 10 }, NL: { dx: -30, dy: -24 }, DK: { dx: -36, dy: -12 }, NO: { dx: -6, dy: 44 }, SE: { dx: 6, dy: 40 },
};
const FLOATING: CountryCode[] = ['BE', 'NL', 'DK'];

export function EuropeMap({ shapes, size, averages, confidences, covered, counts, selected, active, onPick }: Props) {
  const isCovered = (s: MapShape) => !!s.code && covered.includes(s.code as CountryCode);
  const live = shapes.filter(isCovered);
  return (
    <div className="map">
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label={`Map of Western Europe. ${covered.length} countries are covered.`}>
        {shapes.filter((s) => !isCovered(s)).map((s) => (
          <path key={s.id} d={s.d} className="land" />
        ))}
        {live.map((s) => {
          const code = s.code as CountryCode;
          const isOn = selected.includes(code);
          const off = OFFSET[code];
          // Below three vendors an average says nothing: the country stays grey.
          const empty = counts[code] < MIN_PEERS;
          const floating = FLOATING.includes(code);
          const at = { x: s.cx + (off?.dx ?? 0), y: s.cy + (off?.dy ?? 0), dark: floating || empty || averages[code] < 45 };
          return (
            <g
              key={s.id}
              role="button"
              tabIndex={0}
              aria-pressed={active === code}
              aria-label={empty ? `${s.name}: fewer than ${MIN_PEERS} vendors of this category in the dataset` : `${s.name}: average coverage index ${averages[code]} out of 100, ${confidences[code]} confidence`}
              className={`country${active === code ? ' active' : ''}${isOn ? '' : ' off'}`}
              onClick={() => onPick(code)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPick(code);
                }
              }}
            >
              <title>{empty ? `${s.name}: fewer than ${MIN_PEERS} vendors of this category in the dataset.` : `${s.name}: average coverage ${averages[code]}/100 across ${counts[code]} vendors. Confidence: ${confidences[code]}.`}</title>
              <path d={s.d} fill={empty ? '#efe7e0' : colorFor(averages[code])} />
              {floating && <line x1={at.x + 12} y1={at.y - 2} x2={s.cx - 2} y2={s.cy - 1} className="leader" />}
              <text x={at.x} y={at.y} className="value" style={{ fill: at.dark ? '#0a2414' : '#fff' }}>
                {empty ? '–' : averages[code]}
              </text>
              <text x={at.x} y={at.y + 11} className="name" style={{ fill: at.dark ? '#0a2414' : '#fff' }}>
                {code}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="scale" aria-hidden="true">
        {SCALE.map((s) => (
          <span key={s.from} className="step"><i style={{ background: s.color }} />{s.from}{s.from === 60 ? '+' : ''}</span>
        ))}
      </div>
    </div>
  );
}
