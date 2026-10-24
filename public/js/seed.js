// Startbestand aus der bisherigen Excel-Tabelle "Filament Tabelle".
import { colorHexFor, normalizeSpool } from './domain.js';

const ROWS = [
  // Art, Farbe, Kaufgewicht, Restgewicht, Lagerort, geöffnet, im AMS, Spulenart
  ['PLA Basic', 'Orange', 1000, 237, '1', true, false, 'plastik'],
  ['PLA Translucent', 'Rot', 1000, 958, '2', true, false, 'plastik', '#D6001C'],
  ['PLA Basic', 'Hell Grau', 1000, 828, '3', true, false, 'plastik'],
  ['PLA Basic', 'Hell Grün', 1000, 611, '4', true, false, 'plastik'],
  ['PLA Basic', 'Kürbis Orange', 1000, 1000, '5', false, false, 'plastik'],
  ['PLA Basic', 'Schwarz', 1000, 1000, '6', false, false, 'plastik'],
  ['PLA Basic', 'Schwarz', 1000, 580, '', true, true, 'plastik'],
  ['PLA Basic', 'Mistelzweig Grün', 1000, 1000, '', true, true, 'plastik'],
  ['PLA Basic', 'Weiß', 1000, 930, '', true, true, 'plastik'],
  ['PLA Basic', 'Indigo Violett', 1000, 1000, '', true, true, 'plastik'],
  ['PLA Basic', 'Gelb', 250, 80, 'Kiste', true, false, 'pappe'],
  ['PLA Basic', 'Lila', 250, 93, 'Kiste', true, false, 'pappe'],
  ['PLA Basic', 'Rot', 250, 103, 'Kiste', true, false, 'pappe'],
  ['PLA Basic', 'Cyan', 250, 35, 'Kiste', true, false, 'pappe'],
  ['PLA Basic', 'Blau', 250, 25, 'Kiste', true, false, 'pappe'],
  ['PLA Basic', 'Beige', 250, 42, 'Kiste', true, false, 'pappe'],
  ['PLA Basic', 'Bambus Grün', 250, 85, '1k', true, false, 'pappe'],
  ['PLA Basic', 'Grau', 250, 75, '2k', true, false, 'pappe'],
];

export function seedSpools(now = new Date().toISOString()) {
  return ROWS.map(([material, colorName, purchaseWeight, netWeight, location, opened, inAms, spoolTypeId, hex]) =>
    normalizeSpool({
      material,
      brand: 'Bambu Lab',
      colorName,
      colorHex: hex || colorHexFor(colorName),
      purchaseWeight,
      netWeight,
      location,
      opened,
      inAms,
      spoolTypeId,
    }, { now }));
}
