// Western Europe as SVG paths (the ten countries of Chift's survey), computed on the server so the browser never loads the atlas.
import { geoConicConformal, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import world from 'world-atlas/countries-50m.json';

const ISO: Record<string, string> = { '250': 'FR', '276': 'DE', '056': 'BE', '528': 'NL', '724': 'ES', '826': 'GB', '380': 'IT', '208': 'DK', '752': 'SE', '578': 'NO' };

export type MapShape = { id: string; name: string; code: string | null; d: string; cx: number; cy: number };

export function europeShapes(width: number, height: number): MapShape[] {
  const topology = world as unknown as Topology;
  const all = feature(topology, topology.objects.countries) as FeatureCollection<Geometry, { name: string }>;
  const frame = { type: 'MultiPoint' as const, coordinates: [[-9.6, 36.2], [22, 36.2], [-9.6, 66], [22, 66], [6, 36.2], [6, 66]] };
  const projection = geoConicConformal().parallels([42, 60]).rotate([-6, 0]).fitExtent([[0, 0], [width, height]], frame);
  projection.clipExtent([[0, 0], [width, height]]);
  const path = geoPath(projection);
  return all.features
    .map((f) => {
      const [cx, cy] = path.centroid(f);
      return { id: String(f.id), name: f.properties.name, code: ISO[String(f.id)] ?? null, d: path(f) ?? '', cx, cy };
    })
    .filter((s) => s.d);
}
