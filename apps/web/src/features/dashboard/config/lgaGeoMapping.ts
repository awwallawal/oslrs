/**
 * Static name↔code mapping for all 33 Oyo State LGAs.
 * Source of truth: apps/api/src/db/seeds/lgas.seed.ts
 * Used for: GeoJSON processing, choropleth click→filter mapping
 */
export const LGA_NAME_TO_CODE: Record<string, string> = {
  Afijio: 'afijio',
  Akinyele: 'akinyele',
  Atiba: 'atiba',
  Atisbo: 'atisbo',
  Egbeda: 'egbeda',
  'Ibadan North': 'ibadan_north',
  'Ibadan North-East': 'ibadan_north_east',
  'Ibadan North-West': 'ibadan_north_west',
  'Ibadan South-East': 'ibadan_south_east',
  'Ibadan South-West': 'ibadan_south_west',
  'Ibarapa Central': 'ibarapa_central',
  'Ibarapa East': 'ibarapa_east',
  'Ibarapa North': 'ibarapa_north',
  Ido: 'ido',
  Irepo: 'irepo',
  Iseyin: 'iseyin',
  Itesiwaju: 'itesiwaju',
  Iwajowa: 'iwajowa',
  Kajola: 'kajola',
  Lagelu: 'lagelu',
  'Ogbomosho North': 'ogbomosho_north',
  'Ogbomosho South': 'ogbomosho_south',
  'Ogo Oluwa': 'ogo_oluwa',
  Olorunsogo: 'olorunsogo',
  Oluyole: 'oluyole',
  'Ona Ara': 'ona_ara',
  Orelope: 'orelope',
  'Ori Ire': 'ori_ire',
  'Oyo East': 'oyo_east',
  'Oyo West': 'oyo_west',
  'Saki East': 'saki_east',
  'Saki West': 'saki_west',
  Surulere: 'surulere',
};

export const LGA_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(LGA_NAME_TO_CODE).map(([name, code]) => [code, name]),
);
