// ===== Story 13-20: Canonical 150-skill occupational taxonomy =================
// Source of truth: _bmad-output/baseline-report/appendices/appendix-c-skills-taxonomy.md
// (150 rows, ISCO-08 aligned, 20 sectors). This mirrors the `Lga` enum + lga_list
// `canonicalValues` guard from Story 13-16: SKILL_SLUGS pins the exact allowed
// skill_list VALUES so the XLSForm parser flags any non-canonical skill on upload.
//
// AC3 (additive slugs): the 61 slugs previously shipped in the forms are preserved
// VERBATIM so prior `skills_possessed` data stays joinable; the other 89 are new.
// The only label refinement is `security` (was "Security Services" in the 61-list)
// which maps to Appendix-C #116 "Private Security Guard" — slug unchanged, so no
// stored value is orphaned; only the display label follows the canonical source.
//
// SECTOR GROUPING (Story 13-22): the skill->sector map is DERIVED from
// SKILL_TAXONOMY (see SKILL_SECTOR_BY_SLUG below). It replaces the former
// hand-maintained `ISCO08_SECTOR_MAP`, a separate 151-entry vocabulary whose
// slugs predated — and mostly did not match — these canonical 150, so 90/150
// real slugs fell to 'Other'. Deriving from the taxonomy makes the combobox
// grouping and analytics `byCategory` resolve every canonical slug to its
// Appendix-C sector, and it can never drift from the source again.
export interface SkillDefinition {
  /** Stable snake_case slug — the value stored in raw_data.skills_possessed. */
  name: string;
  /** Human-readable label (verbatim from Appendix C). */
  label: string;
  /** ISCO-08 sector grouping (one of 20). */
  sector: string;
  /** ISCO-08 occupation code (analytical reference only). */
  isco: string;
}

// `satisfies` (not a widening annotation) so `as const` survives — SkillSlug
// below resolves to the literal 150-member union, delivering the enum-like type.
export const SKILL_TAXONOMY = [
  { name: 'carpentry', label: 'Carpentry/Woodwork', sector: 'Construction & Building', isco: '7115' },
  { name: 'plumbing', label: 'Plumbing', sector: 'Construction & Building', isco: '7126' },
  { name: 'electrical', label: 'Electrical Installation', sector: 'Construction & Building', isco: '7411' },
  { name: 'welding', label: 'Welding & Fabrication', sector: 'Construction & Building', isco: '7212' },
  { name: 'masonry', label: 'Masonry/Bricklaying', sector: 'Construction & Building', isco: '7112' },
  { name: 'painting', label: 'Painting & Decoration', sector: 'Construction & Building', isco: '7131' },
  { name: 'tiling', label: 'Tiling & Flooring', sector: 'Construction & Building', isco: '7122' },
  { name: 'roofing', label: 'Roofing', sector: 'Construction & Building', isco: '7121' },
  { name: 'hvac', label: 'HVAC/Air Conditioning', sector: 'Construction & Building', isco: '7127' },
  { name: 'solar', label: 'Solar Installation', sector: 'Construction & Building', isco: '7413' },
  { name: 'aluminum', label: 'Aluminum & Glass Fitting', sector: 'Construction & Building', isco: '7125' },
  { name: 'pop_plastering', label: 'POP/Plaster of Paris Work', sector: 'Construction & Building', isco: '7123' },
  { name: 'auto_mechanic', label: 'Auto Mechanic', sector: 'Automotive & Mechanical', isco: '7231' },
  { name: 'auto_electrician', label: 'Auto Electrician', sector: 'Automotive & Mechanical', isco: '7412' },
  { name: 'panel_beating', label: 'Panel Beating & Spray Painting', sector: 'Automotive & Mechanical', isco: '7213' },
  { name: 'vulcanizing', label: 'Vulcanizing/Tire Services', sector: 'Automotive & Mechanical', isco: '7233' },
  { name: 'motorcycle_repair', label: 'Motorcycle/Tricycle Repair', sector: 'Automotive & Mechanical', isco: '7234' },
  { name: 'heavy_equipment', label: 'Heavy Equipment Operation', sector: 'Automotive & Mechanical', isco: '8342' },
  { name: 'generator_repair', label: 'Generator Repair', sector: 'Automotive & Mechanical', isco: '7421' },
  { name: 'battery_inverter', label: 'Battery/Inverter Technician', sector: 'Automotive & Mechanical', isco: '7422' },
  { name: 'tailoring', label: 'Tailoring/Sewing', sector: 'Fashion, Beauty & Personal Care', isco: '7531' },
  { name: 'fashion_design', label: 'Fashion Design', sector: 'Fashion, Beauty & Personal Care', isco: '7531' },
  { name: 'hairdressing', label: 'Hairdressing/Styling', sector: 'Fashion, Beauty & Personal Care', isco: '5141' },
  { name: 'barbing', label: 'Barbing', sector: 'Fashion, Beauty & Personal Care', isco: '5141' },
  { name: 'makeup', label: 'Makeup Artistry', sector: 'Fashion, Beauty & Personal Care', isco: '5142' },
  { name: 'shoe_making', label: 'Shoe Making/Cobbling', sector: 'Fashion, Beauty & Personal Care', isco: '7536' },
  { name: 'bag_making', label: 'Bag Making/Leather Craft', sector: 'Fashion, Beauty & Personal Care', isco: '7535' },
  { name: 'jewelry', label: 'Jewelry Making', sector: 'Fashion, Beauty & Personal Care', isco: '7313' },
  { name: 'nail_technology', label: 'Nail Technology', sector: 'Fashion, Beauty & Personal Care', isco: '5142' },
  { name: 'farming', label: 'Crop Farming', sector: 'Food, Agriculture & Processing', isco: '6111' },
  { name: 'livestock', label: 'Livestock/Poultry Farming', sector: 'Food, Agriculture & Processing', isco: '6121' },
  { name: 'fishery', label: 'Fishery/Aquaculture', sector: 'Food, Agriculture & Processing', isco: '6221' },
  { name: 'catering', label: 'Catering/Event Cooking', sector: 'Food, Agriculture & Processing', isco: '5120' },
  { name: 'baking', label: 'Baking & Confectionery', sector: 'Food, Agriculture & Processing', isco: '7512' },
  { name: 'food_processing', label: 'Food Processing/Preservation', sector: 'Food, Agriculture & Processing', isco: '7514' },
  { name: 'butchery', label: 'Butchery/Meat Processing', sector: 'Food, Agriculture & Processing', isco: '7511' },
  { name: 'agro_processing', label: 'Agro-Processing Equipment Operation', sector: 'Food, Agriculture & Processing', isco: '8160' },
  { name: 'horticulture', label: 'Horticulture/Floriculture', sector: 'Food, Agriculture & Processing', isco: '6113' },
  { name: 'software_dev', label: 'Software Development', sector: 'Digital, Technology & Office', isco: '2512' },
  { name: 'web_design', label: 'Web Design/Development', sector: 'Digital, Technology & Office', isco: '2513' },
  { name: 'graphic_design', label: 'Graphic Design', sector: 'Digital, Technology & Office', isco: '2166' },
  { name: 'video_editing', label: 'Video Editing/Production', sector: 'Digital, Technology & Office', isco: '2642' },
  { name: 'data_entry', label: 'Data Entry/Typing', sector: 'Digital, Technology & Office', isco: '4132' },
  { name: 'accounting', label: 'Accounting/Bookkeeping', sector: 'Digital, Technology & Office', isco: '3313' },
  { name: 'office_admin', label: 'Office Administration', sector: 'Digital, Technology & Office', isco: '4110' },
  { name: 'computer_repair', label: 'Computer/Phone Repair', sector: 'Digital, Technology & Office', isco: '7422' },
  { name: 'social_media', label: 'Social Media Management', sector: 'Digital, Technology & Office', isco: '2431' },
  { name: 'digital_marketing', label: 'Digital Marketing/SEO', sector: 'Digital, Technology & Office', isco: '2431' },
  { name: 'nursing', label: 'Nursing/Patient Care', sector: 'Healthcare & Wellness', isco: '3221' },
  { name: 'pharmacy_tech', label: 'Pharmacy Assistant', sector: 'Healthcare & Wellness', isco: '3213' },
  { name: 'lab_tech', label: 'Laboratory Technician', sector: 'Healthcare & Wellness', isco: '3212' },
  { name: 'community_health', label: 'Community Health Worker', sector: 'Healthcare & Wellness', isco: '3253' },
  { name: 'caregiving', label: 'Elderly/Child Caregiving', sector: 'Healthcare & Wellness', isco: '5311' },
  { name: 'physiotherapy', label: 'Physiotherapy Assistant', sector: 'Healthcare & Wellness', isco: '3255' },
  { name: 'traditional_medicine', label: 'Traditional Medicine/Herbalism', sector: 'Healthcare & Wellness', isco: '3230' },
  { name: 'dental_assistant', label: 'Dental Assistant', sector: 'Healthcare & Wellness', isco: '3251' },
  { name: 'teaching', label: 'Teaching/Tutoring', sector: 'Education & Professional Services', isco: '2330' },
  { name: 'driving', label: 'Professional Driving', sector: 'Education & Professional Services', isco: '8322' },
  { name: 'event_planning', label: 'Event Planning/Decoration', sector: 'Education & Professional Services', isco: '3332' },
  { name: 'photography', label: 'Photography/Videography', sector: 'Education & Professional Services', isco: '3431' },
  { name: 'cleaning', label: 'Professional Cleaning', sector: 'Education & Professional Services', isco: '9112' },
  { name: 'laundry', label: 'Laundry/Dry Cleaning', sector: 'Education & Professional Services', isco: '9121' },
  { name: 'translation', label: 'Translation/Interpretation', sector: 'Education & Professional Services', isco: '2643' },
  { name: 'paralegal', label: 'Legal Clerk/Paralegal', sector: 'Education & Professional Services', isco: '3411' },
  { name: 'furniture', label: 'Furniture Making', sector: 'Artisan & Traditional Crafts', isco: '7522' },
  { name: 'upholstery', label: 'Upholstery', sector: 'Artisan & Traditional Crafts', isco: '7534' },
  { name: 'pottery', label: 'Pottery/Ceramics', sector: 'Artisan & Traditional Crafts', isco: '7314' },
  { name: 'blacksmith', label: 'Blacksmithing', sector: 'Artisan & Traditional Crafts', isco: '7221' },
  { name: 'weaving', label: 'Weaving/Textile Crafts', sector: 'Artisan & Traditional Crafts', isco: '7318' },
  { name: 'sign_writing', label: 'Sign Writing/Branding', sector: 'Artisan & Traditional Crafts', isco: '7316' },
  { name: 'calabash_carving', label: 'Calabash/Gourd Carving', sector: 'Artisan & Traditional Crafts', isco: '7317' },
  { name: 'commercial_driving', label: 'Commercial Bus/Taxi Driving', sector: 'Transport & Logistics', isco: '8322' },
  { name: 'okada_riding', label: 'Motorcycle Taxi (Okada) Riding', sector: 'Transport & Logistics', isco: '8321' },
  { name: 'keke_operation', label: 'Tricycle (Keke) Operation', sector: 'Transport & Logistics', isco: '8321' },
  { name: 'haulage_driving', label: 'Truck/Haulage Driving', sector: 'Transport & Logistics', isco: '8332' },
  { name: 'dispatch_courier', label: 'Dispatch Riding/Courier', sector: 'Transport & Logistics', isco: '4412' },
  { name: 'warehouse_management', label: 'Warehouse Management', sector: 'Transport & Logistics', isco: '4321' },
  { name: 'logistics_coordination', label: 'Freight/Logistics Coordination', sector: 'Transport & Logistics', isco: '3331' },
  { name: 'forklift_operation', label: 'Forklift Operation', sector: 'Transport & Logistics', isco: '8344' },
  { name: 'trading', label: 'Trading/General Commerce', sector: 'Sales & Commerce', isco: '5221' },
  { name: 'agrochemical_sales', label: 'Agrochemical Sales', sector: 'Sales & Commerce', isco: '5223' },
  { name: 'medical_sales', label: 'Pharmaceutical/Medical Sales', sector: 'Sales & Commerce', isco: '5223' },
  { name: 'building_materials_sales', label: 'Building Materials Sales', sector: 'Sales & Commerce', isco: '5223' },
  { name: 'electronics_sales', label: 'Electronics/Phone Sales', sector: 'Sales & Commerce', isco: '5223' },
  { name: 'fmcg_distribution', label: 'Provisions/FMCG Distribution', sector: 'Sales & Commerce', isco: '5221' },
  { name: 'fuel_retailing', label: 'Fuel/Gas Retailing', sector: 'Sales & Commerce', isco: '5245' },
  { name: 'auto_parts_sales', label: 'Auto Parts Sales', sector: 'Sales & Commerce', isco: '5223' },
  { name: 'quarrying', label: 'Quarrying/Stone Cutting', sector: 'Mining & Quarrying', isco: '8111' },
  { name: 'sand_mining', label: 'Sand Mining/Dredging', sector: 'Mining & Quarrying', isco: '8113' },
  { name: 'mineral_mining', label: 'Gold/Mineral Artisan Mining', sector: 'Mining & Quarrying', isco: '8114' },
  { name: 'clay_extraction', label: 'Clay/Kaolin Extraction', sector: 'Mining & Quarrying', isco: '8113' },
  { name: 'aggregate_processing', label: 'Gravel/Aggregate Processing', sector: 'Mining & Quarrying', isco: '8112' },
  { name: 'soap_making', label: 'Soap/Detergent Making', sector: 'Manufacturing & Industrial', isco: '8131' },
  { name: 'water_production', label: 'Sachet/Bottled Water Production', sector: 'Manufacturing & Industrial', isco: '8160' },
  { name: 'block_making', label: 'Block/Brick Making', sector: 'Manufacturing & Industrial', isco: '8114' },
  { name: 'paint_manufacturing', label: 'Paint Manufacturing', sector: 'Manufacturing & Industrial', isco: '8131' },
  { name: 'plastic_recycling', label: 'Plastic/Rubber Recycling', sector: 'Manufacturing & Industrial', isco: '8142' },
  { name: 'garment_factory', label: 'Textile/Garment Factory Work', sector: 'Manufacturing & Industrial', isco: '8153' },
  { name: 'metal_fabrication', label: 'Metal Fabrication/Foundry', sector: 'Manufacturing & Industrial', isco: '7211' },
  { name: 'printing_production', label: 'Paper/Printing Production', sector: 'Manufacturing & Industrial', isco: '8143' },
  { name: 'hotel_management', label: 'Hotel/Guest House Management', sector: 'Hospitality & Tourism', isco: '1411' },
  { name: 'restaurant_management', label: 'Restaurant/Bar Management', sector: 'Hospitality & Tourism', isco: '1412' },
  { name: 'bartending', label: 'Bartending/Mixology', sector: 'Hospitality & Tourism', isco: '5132' },
  { name: 'tour_guide', label: 'Tour Guide Services', sector: 'Hospitality & Tourism', isco: '5113' },
  { name: 'event_centre_management', label: 'Event Centre Management', sector: 'Hospitality & Tourism', isco: '1439' },
  { name: 'apartment_hosting', label: 'Short-Let/Apartment Hosting', sector: 'Hospitality & Tourism', isco: '1411' },
  { name: 'chef', label: 'Chef/Professional Cooking', sector: 'Hospitality & Tourism', isco: '3434' },
  { name: 'music_production', label: 'Music Production/DJ', sector: 'Entertainment & Creative Arts', isco: '2652' },
  { name: 'acting', label: 'Acting/Theatre Performance', sector: 'Entertainment & Creative Arts', isco: '2655' },
  { name: 'comedy_mc', label: 'Comedy/MC/Entertainment', sector: 'Entertainment & Creative Arts', isco: '2655' },
  { name: 'dance', label: 'Dance/Choreography', sector: 'Entertainment & Creative Arts', isco: '2653' },
  { name: 'sound_engineering', label: 'Sound Engineering', sector: 'Entertainment & Creative Arts', isco: '3521' },
  { name: 'instrument_playing', label: 'Musical Instrument Playing', sector: 'Entertainment & Creative Arts', isco: '2652' },
  { name: 'fine_art', label: 'Fine Art/Painting', sector: 'Entertainment & Creative Arts', isco: '2651' },
  { name: 'animation', label: 'Animation/Motion Graphics', sector: 'Entertainment & Creative Arts', isco: '2166' },
  { name: 'security', label: 'Private Security Guard', sector: 'Security & Safety Services', isco: '5414' },
  { name: 'cctv_installation', label: 'CCTV/Surveillance Installation', sector: 'Security & Safety Services', isco: '7421' },
  { name: 'fire_safety', label: 'Fire Safety/Extinguisher Services', sector: 'Security & Safety Services', isco: '5411' },
  { name: 'locksmith', label: 'Locksmith Services', sector: 'Security & Safety Services', isco: '7222' },
  { name: 'dog_training', label: 'Dog Training/K9 Handler', sector: 'Security & Safety Services', isco: '5164' },
  { name: 'crowd_management', label: 'Traffic/Crowd Management', sector: 'Security & Safety Services', isco: '5414' },
  { name: 'waste_collection', label: 'Waste Collection/Disposal', sector: 'Waste Management & Environmental', isco: '9611' },
  { name: 'scrap_dealing', label: 'Recycling/Scrap Dealing', sector: 'Waste Management & Environmental', isco: '9612' },
  { name: 'pest_control', label: 'Fumigation/Pest Control', sector: 'Waste Management & Environmental', isco: '7544' },
  { name: 'drainage_services', label: 'Sewage/Drainage Services', sector: 'Waste Management & Environmental', isco: '7126' },
  { name: 'environmental_remediation', label: 'Environmental Remediation', sector: 'Waste Management & Environmental', isco: '3257' },
  { name: 'clergy', label: 'Religious Leadership/Clergy', sector: 'Religious & Community Services', isco: '2636' },
  { name: 'islamic_teaching', label: 'Quranic/Islamic Teaching', sector: 'Religious & Community Services', isco: '2342' },
  { name: 'choir_direction', label: 'Church Music/Choir Direction', sector: 'Religious & Community Services', isco: '2652' },
  { name: 'community_development', label: 'Community Development Work', sector: 'Religious & Community Services', isco: '3412' },
  { name: 'counselling', label: 'Counselling Services', sector: 'Religious & Community Services', isco: '2634' },
  { name: 'borehole_drilling', label: 'Borehole Drilling', sector: 'Energy & Utilities', isco: '8113' },
  { name: 'water_treatment', label: 'Water Treatment/Purification', sector: 'Energy & Utilities', isco: '3132' },
  { name: 'power_line_work', label: 'Electrical Power Line Work', sector: 'Energy & Utilities', isco: '7413' },
  { name: 'gas_pipeline', label: 'Gas Pipeline Fitting', sector: 'Energy & Utilities', isco: '7126' },
  { name: 'engine_servicing', label: 'Diesel/Petrol Engine Servicing', sector: 'Energy & Utilities', isco: '7233' },
  { name: 'renewable_energy', label: 'Renewable Energy Technician', sector: 'Energy & Utilities', isco: '7413' },
  { name: 'boat_building', label: 'Boat Building/Repair', sector: 'Marine & Waterway Services', isco: '7521' },
  { name: 'river_fishing', label: 'Fishing (River/Lake)', sector: 'Marine & Waterway Services', isco: '6222' },
  { name: 'boat_operation', label: 'Canoe/Boat Operation', sector: 'Marine & Waterway Services', isco: '8350' },
  { name: 'fish_smoking', label: 'Fish Smoking/Drying', sector: 'Marine & Waterway Services', isco: '7514' },
  { name: 'pond_construction', label: 'Pond/Dam Construction', sector: 'Marine & Waterway Services', isco: '7114' },
  { name: 'estate_agency', label: 'Property/Estate Agency', sector: 'Real Estate & Property Services', isco: '3334' },
  { name: 'land_surveying', label: 'Land Surveying', sector: 'Real Estate & Property Services', isco: '2165' },
  { name: 'quantity_surveying', label: 'Building/Quantity Surveying', sector: 'Real Estate & Property Services', isco: '2142' },
  { name: 'architecture', label: 'Architecture/Draughtsmanship', sector: 'Real Estate & Property Services', isco: '2161' },
  { name: 'interior_design', label: 'Interior Design/Decoration', sector: 'Real Estate & Property Services', isco: '3432' },
  { name: 'facility_management', label: 'Facility Management', sector: 'Real Estate & Property Services', isco: '1219' },
  { name: 'pool_maintenance', label: 'Swimming Pool Construction/Maintenance', sector: 'Real Estate & Property Services', isco: '7119' },
  { name: 'storage_construction', label: 'Pest-Proof Storage Construction', sector: 'Real Estate & Property Services', isco: '7119' },
] as const satisfies readonly SkillDefinition[];

/** Union of the canonical skill slugs (literal 150-member union). */
export type SkillSlug = (typeof SKILL_TAXONOMY)[number]['name'];

/** The 150 canonical skill slugs — pins skill_list.canonicalValues (Story 13-20). */
export const SKILL_SLUGS: readonly SkillSlug[] = SKILL_TAXONOMY.map((s) => s.name);

/**
 * The single bucket for non-canonical values — custom_* free-text skills a
 * registrant declared (e.g. `custom_realtor`) and any legacy/unknown slug.
 * These are counted, never silently dropped (Story 13-22 AC3), but they do not
 * belong to any Appendix-C sector, so they group here.
 */
export const OTHER_SKILL_SECTOR = 'Other / Custom trades';

/**
 * Skill slug -> Appendix-C sector, DERIVED from SKILL_TAXONOMY (Story 13-22).
 * Single source of truth for both frontend grouping (ComboboxMultiSelect) and
 * backend analytics aggregation (`byCategory`). Every one of the canonical 150
 * slugs resolves to its sector; non-canonical/custom values fall to
 * OTHER_SKILL_SECTOR via `skillSectorForSlug`.
 */
export const SKILL_SECTOR_BY_SLUG: Record<SkillSlug, string> = Object.fromEntries(
  SKILL_TAXONOMY.map((s) => [s.name, s.sector]),
) as Record<SkillSlug, string>;

/**
 * Resolve a stored skill value to its sector. Canonical slugs map to their
 * Appendix-C sector; custom_* and any other non-canonical value bucket under
 * OTHER_SKILL_SECTOR (never dropped).
 */
export function skillSectorForSlug(slug: string): string {
  return SKILL_SECTOR_BY_SLUG[slug as SkillSlug] ?? OTHER_SKILL_SECTOR;
}

/** Unique canonical sector names, derived from the taxonomy (the 20 Appendix-C sectors). */
export const SKILL_SECTORS: string[] = [
  ...new Set(SKILL_TAXONOMY.map((s) => s.sector)),
];
