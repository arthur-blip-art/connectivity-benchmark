// Fails with a readable message when a data file breaks its schema. Same check as the build.
import { countries, dataset, measures, settings } from '../src/lib/data';

console.log(
  `data valid: ${dataset.editors.length} vendors, ${dataset.software.length} software, ${dataset.markets.length} market entries, ` +
  `${dataset.connections.length} connections, ${countries.length} countries, ${measures.length} measures, collected ${settings.collectedAt}`,
);
