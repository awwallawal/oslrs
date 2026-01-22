/**
 * Oyo State Local Government Areas (LGAs) Seed Data
 * 33 LGAs as per official administrative divisions
 * ADR-017: Database Seeding Strategy
 *
 * Note: Codes match the Lga enum in @oslsr/types (snake_case format)
 */

export const OYO_STATE_LGAS = [
  { name: 'Afijio', code: 'afijio' },
  { name: 'Akinyele', code: 'akinyele' },
  { name: 'Atiba', code: 'atiba' },
  { name: 'Atisbo', code: 'atisbo' },
  { name: 'Egbeda', code: 'egbeda' },
  { name: 'Ibadan North', code: 'ibadan_north' },
  { name: 'Ibadan North-East', code: 'ibadan_north_east' },
  { name: 'Ibadan North-West', code: 'ibadan_north_west' },
  { name: 'Ibadan South-East', code: 'ibadan_south_east' },
  { name: 'Ibadan South-West', code: 'ibadan_south_west' },
  { name: 'Ibarapa Central', code: 'ibarapa_central' },
  { name: 'Ibarapa East', code: 'ibarapa_east' },
  { name: 'Ibarapa North', code: 'ibarapa_north' },
  { name: 'Ido', code: 'ido' },
  { name: 'Irepo', code: 'irepo' },
  { name: 'Iseyin', code: 'iseyin' },
  { name: 'Itesiwaju', code: 'itesiwaju' },
  { name: 'Iwajowa', code: 'iwajowa' },
  { name: 'Kajola', code: 'kajola' },
  { name: 'Lagelu', code: 'lagelu' },
  { name: 'Ogbomosho North', code: 'ogbomosho_north' },
  { name: 'Ogbomosho South', code: 'ogbomosho_south' },
  { name: 'Ogo Oluwa', code: 'ogo_oluwa' },
  { name: 'Olorunsogo', code: 'olorunsogo' },
  { name: 'Oluyole', code: 'oluyole' },
  { name: 'Ona Ara', code: 'ona_ara' },
  { name: 'Orelope', code: 'orelope' },
  { name: 'Ori Ire', code: 'ori_ire' },
  { name: 'Oyo East', code: 'oyo_east' },
  { name: 'Oyo West', code: 'oyo_west' },
  { name: 'Saki East', code: 'saki_east' },
  { name: 'Saki West', code: 'saki_west' },
  { name: 'Surulere', code: 'surulere' },
] as const;

export type LGACode = typeof OYO_STATE_LGAS[number]['code'];
