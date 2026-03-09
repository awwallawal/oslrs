import { useState, useRef, useEffect, useMemo } from 'react';
import type { QuestionRendererProps } from './QuestionRenderer';
import type { Choice } from '@oslsr/types';

/**
 * Searchable multi-select with sector grouping, selected chips, and custom entry.
 * Used when a select_multiple question has a large choice list (>20 options).
 *
 * UX pattern:
 * 1. Selected chips at top (removable)
 * 2. Search input to filter
 * 3. Grouped dropdown (collapsible sector headers)
 * 4. "Add custom skill" button for values not in the taxonomy
 */

/** Infer sector grouping from choice value prefixes or adjacent label patterns */
function groupChoices(choices: Choice[]): { sector: string; choices: Choice[] }[] {
  // The questionnaire schema lists choices in sector order.
  // We detect sector boundaries by looking for common naming patterns.
  // Group map: value prefix → sector name (based on ISCO-08 taxonomy)
  const SECTOR_MAP: Record<string, string> = {
    // Construction
    bricklaying: 'Construction & Building', plastering: 'Construction & Building',
    painting: 'Construction & Building', tiling: 'Construction & Building',
    carpentry: 'Construction & Building', plumbing: 'Construction & Building',
    electrical: 'Construction & Building', welding: 'Construction & Building',
    aluminium_glass: 'Construction & Building', pop_ceiling: 'Construction & Building',
    iron_bending: 'Construction & Building', roofing: 'Construction & Building',
    heavy_equipment: 'Construction & Building', interlocking_paving: 'Construction & Building',
    surveying: 'Construction & Building', quantity_surveying: 'Construction & Building',
    // Automotive
    auto_mechanic: 'Automotive & Mechanical', auto_electrician: 'Automotive & Mechanical',
    motorcycle_repair: 'Automotive & Mechanical', vulcanizing: 'Automotive & Mechanical',
    panel_beating: 'Automotive & Mechanical', generator_repair: 'Automotive & Mechanical',
    hvac: 'Automotive & Mechanical',
    // Fashion
    tailoring: 'Fashion, Beauty & Personal Care', fashion_design: 'Fashion, Beauty & Personal Care',
    aso_oke_weaving: 'Fashion, Beauty & Personal Care', adire_dyeing: 'Fashion, Beauty & Personal Care',
    hairdressing: 'Fashion, Beauty & Personal Care', barbing: 'Fashion, Beauty & Personal Care',
    makeup: 'Fashion, Beauty & Personal Care', cosmetology: 'Fashion, Beauty & Personal Care',
    nail_tech: 'Fashion, Beauty & Personal Care', leather_work: 'Fashion, Beauty & Personal Care',
    bead_making: 'Fashion, Beauty & Personal Care',
    // Food & Agriculture
    crop_farming: 'Food, Agriculture & Processing', vegetable_farming: 'Food, Agriculture & Processing',
    poultry: 'Food, Agriculture & Processing', fish_farming: 'Food, Agriculture & Processing',
    livestock: 'Food, Agriculture & Processing', cassava_processing: 'Food, Agriculture & Processing',
    palm_oil: 'Food, Agriculture & Processing', baking: 'Food, Agriculture & Processing',
    catering: 'Food, Agriculture & Processing', butchery: 'Food, Agriculture & Processing',
    snail_farming: 'Food, Agriculture & Processing', bee_keeping: 'Food, Agriculture & Processing',
    grain_milling: 'Food, Agriculture & Processing', cocoa_farming: 'Food, Agriculture & Processing',
    farm_mechanisation: 'Food, Agriculture & Processing',
    // Digital & Technology
    computer_repair: 'Digital, Technology & Office', phone_repair: 'Digital, Technology & Office',
    web_dev: 'Digital, Technology & Office', mobile_app_dev: 'Digital, Technology & Office',
    graphic_design: 'Digital, Technology & Office', digital_marketing: 'Digital, Technology & Office',
    data_entry: 'Digital, Technology & Office', networking: 'Digital, Technology & Office',
    cctv_security: 'Digital, Technology & Office', photography: 'Digital, Technology & Office',
    video_editing: 'Digital, Technology & Office', solar_pv: 'Digital, Technology & Office',
    accounting: 'Digital, Technology & Office',
    // Healthcare
    community_health: 'Healthcare & Wellness', nursing: 'Healthcare & Wellness',
    pharmacy_tech: 'Healthcare & Wellness', lab_tech: 'Healthcare & Wellness',
    dental_tech: 'Healthcare & Wellness', optometry: 'Healthcare & Wellness',
    physiotherapy: 'Healthcare & Wellness', traditional_medicine: 'Healthcare & Wellness',
    health_records: 'Healthcare & Wellness',
    // Education
    teaching: 'Education & Professional Services', vocational_instruction: 'Education & Professional Services',
    adult_literacy: 'Education & Professional Services', tutoring: 'Education & Professional Services',
    sign_language: 'Education & Professional Services', legal_clerking: 'Education & Professional Services',
    tax_preparation: 'Education & Professional Services',
    // Artisan
    blacksmithing: 'Artisan & Traditional Crafts', woodcarving: 'Artisan & Traditional Crafts',
    pottery: 'Artisan & Traditional Crafts', mat_weaving: 'Artisan & Traditional Crafts',
    calabash_carving: 'Artisan & Traditional Crafts', bronze_casting: 'Artisan & Traditional Crafts',
    upholstery: 'Artisan & Traditional Crafts', sign_writing: 'Artisan & Traditional Crafts',
    // Transport
    commercial_driving: 'Transport & Logistics', motorcycle_dispatch: 'Transport & Logistics',
    tricycle_operation: 'Transport & Logistics', forklift_operation: 'Transport & Logistics',
    freight_logistics: 'Transport & Logistics', driving_instruction: 'Transport & Logistics',
    fleet_management: 'Transport & Logistics',
    // Sales
    agrochem_sales: 'Sales, Marketing & Distribution', pharma_sales: 'Sales, Marketing & Distribution',
    fmcg_sales: 'Sales, Marketing & Distribution', real_estate: 'Sales, Marketing & Distribution',
    building_materials: 'Sales, Marketing & Distribution', auto_parts: 'Sales, Marketing & Distribution',
    market_trading: 'Sales, Marketing & Distribution', ecommerce: 'Sales, Marketing & Distribution',
    insurance_sales: 'Sales, Marketing & Distribution',
    // Retail
    retail_management: 'Retail & Commerce', pos_agent: 'Retail & Commerce',
    fuel_station: 'Retail & Commerce', patent_medicine: 'Retail & Commerce',
    telecom_retail: 'Retail & Commerce', provisions_retail: 'Retail & Commerce',
    // Mining
    quarrying: 'Mining, Quarrying & Extraction', sand_dredging: 'Mining, Quarrying & Extraction',
    artisanal_mining: 'Mining, Quarrying & Extraction', gemstone_cutting: 'Mining, Quarrying & Extraction',
    // Oil & Gas
    petroleum_distribution: 'Oil, Gas & Energy', gas_plant: 'Oil, Gas & Energy',
    pipeline_welding: 'Oil, Gas & Energy', drilling: 'Oil, Gas & Energy',
    power_line: 'Oil, Gas & Energy', renewable_energy: 'Oil, Gas & Energy',
    // Manufacturing
    soap_manufacturing: 'Manufacturing & Processing', water_production: 'Manufacturing & Processing',
    block_making: 'Manufacturing & Processing', plastic_manufacturing: 'Manufacturing & Processing',
    printing: 'Manufacturing & Processing',
    // Hospitality
    hotel_management: 'Hospitality & Tourism', event_planning: 'Hospitality & Tourism',
    bartending: 'Hospitality & Tourism', tour_guiding: 'Hospitality & Tourism',
    laundry: 'Hospitality & Tourism',
    // Entertainment
    music_production: 'Entertainment & Creative Arts', dj_services: 'Entertainment & Creative Arts',
    mc_services: 'Entertainment & Creative Arts', acting: 'Entertainment & Creative Arts',
    drumming: 'Entertainment & Creative Arts', animation: 'Entertainment & Creative Arts',
    // Security
    security_guard: 'Security & Safety', fire_safety: 'Security & Safety',
    ohs: 'Security & Safety', traffic_management: 'Security & Safety',
    // Domestic
    housekeeping: 'Domestic & Personal Services', childcare: 'Domestic & Personal Services',
    elderly_care: 'Domestic & Personal Services', gardening: 'Domestic & Personal Services',
    // Waste
    waste_collection: 'Waste, Recycling & Environment', scrap_recycling: 'Waste, Recycling & Environment',
    plastic_recycling: 'Waste, Recycling & Environment', fumigation: 'Waste, Recycling & Environment',
    // Legal/Religious
    religious_ministry: 'Legal, Religious & Community', quranic_teaching: 'Legal, Religious & Community',
    community_development: 'Legal, Religious & Community', mediation: 'Legal, Religious & Community',
    cooperative_management: 'Legal, Religious & Community',
  };

  const grouped = new Map<string, Choice[]>();
  for (const choice of choices) {
    const sector = SECTOR_MAP[choice.value] || 'Other';
    if (!grouped.has(sector)) grouped.set(sector, []);
    grouped.get(sector)!.push(choice);
  }
  return Array.from(grouped.entries()).map(([sector, choices]) => ({ sector, choices }));
}

const COMBOBOX_THRESHOLD = 20;

export function ComboboxMultiSelect({
  question,
  value,
  onChange,
  error,
  disabled,
}: QuestionRendererProps) {
  const choices = useMemo(() => question.choices ?? [], [question.choices]);
  const selected = Array.isArray(value) ? (value as string[]) : [];

  // If the list is small enough, fall through to checkbox rendering won't happen
  // because QuestionRenderer routes here only for large lists

  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowCustomInput(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Build choice lookup map for displaying selected chip labels
  const choiceMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of choices) map.set(c.value, c.label);
    return map;
  }, [choices]);

  // Filter choices by search term
  const filteredChoices = useMemo(() => {
    if (!search.trim()) return choices;
    const lower = search.toLowerCase();
    return choices.filter(
      (c) =>
        c.label.toLowerCase().includes(lower) ||
        c.value.toLowerCase().includes(lower)
    );
  }, [choices, search]);

  // Group filtered results by sector
  const groups = useMemo(() => groupChoices(filteredChoices), [filteredChoices]);

  const toggleChoice = (choiceValue: string) => {
    if (selected.includes(choiceValue)) {
      onChange(selected.filter((v) => v !== choiceValue));
    } else {
      onChange([...selected, choiceValue]);
    }
  };

  const removeChip = (choiceValue: string) => {
    onChange(selected.filter((v) => v !== choiceValue));
  };

  const addCustomSkill = () => {
    const trimmed = customValue.trim();
    if (!trimmed) return;
    // Convert to snake_case-ish value
    const val = 'custom_' + trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!selected.includes(val)) {
      onChange([...selected, val]);
    }
    setCustomValue('');
    setShowCustomInput(false);
  };

  return (
    <div className="space-y-2" ref={dropdownRef}>
      <fieldset>
        <legend className="block text-base font-medium text-gray-900">
          {question.label}
          {question.required && <span className="text-red-600 ml-1">*</span>}
        </legend>
        {question.labelYoruba && (
          <p className="text-sm text-gray-500 italic">{question.labelYoruba}</p>
        )}

        {/* Selected chips */}
        {selected.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2" data-testid="selected-chips">
            {selected.map((val) => (
              <span
                key={val}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm
                  bg-[#9C1E23]/10 text-[#9C1E23] border border-[#9C1E23]/20"
              >
                {choiceMap.get(val) || val.replace(/^custom_/, '').replace(/_/g, ' ')}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeChip(val)}
                    className="ml-1 text-[#9C1E23]/60 hover:text-[#9C1E23] focus:outline-none"
                    aria-label={`Remove ${choiceMap.get(val) || val}`}
                    data-testid={`remove-chip-${val}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Search input */}
        <div className="mt-3 relative">
          <input
            ref={searchRef}
            type="text"
            placeholder={`Search ${choices.length} skills...`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base
              focus:ring-2 focus:ring-[#9C1E23]/20 focus:border-[#9C1E23]
              disabled:cursor-not-allowed disabled:opacity-60"
            data-testid={`combobox-search-${question.name}`}
          />
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Dropdown */}
        {isOpen && !disabled && (
          <div
            className="mt-1 border border-gray-200 rounded-lg bg-white shadow-lg max-h-72 overflow-y-auto z-10"
            data-testid={`combobox-dropdown-${question.name}`}
          >
            {groups.length === 0 ? (
              <div className="px-4 py-3 text-gray-500 text-sm">
                No skills match &ldquo;{search}&rdquo;
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.sector}>
                  {/* Sector header */}
                  <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky top-0">
                    {group.sector}
                  </div>
                  {group.choices.map((choice) => {
                    const isSelected = selected.includes(choice.value);
                    return (
                      <button
                        key={choice.value}
                        type="button"
                        onClick={() => toggleChoice(choice.value)}
                        className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm
                          hover:bg-gray-50 transition-colors
                          ${isSelected ? 'bg-[#9C1E23]/5 text-[#9C1E23] font-medium' : 'text-gray-900'}`}
                        data-testid={`option-${question.name}-${choice.value}`}
                      >
                        <span className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center
                          ${isSelected
                            ? 'border-[#9C1E23] bg-[#9C1E23] text-white'
                            : 'border-gray-300'}`}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        {choice.label}
                      </button>
                    );
                  })}
                </div>
              ))
            )}

            {/* Add custom skill button */}
            <div className="border-t border-gray-200">
              {!showCustomInput ? (
                <button
                  type="button"
                  onClick={() => setShowCustomInput(true)}
                  className="w-full px-4 py-3 text-left text-sm text-[#9C1E23] font-medium
                    hover:bg-[#9C1E23]/5 flex items-center gap-2"
                  data-testid={`add-custom-${question.name}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add skill not listed
                </button>
              ) : (
                <div className="px-4 py-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="Type custom skill..."
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomSkill(); } }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm
                      focus:ring-1 focus:ring-[#9C1E23]/20 focus:border-[#9C1E23]"
                    data-testid={`custom-input-${question.name}`}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={addCustomSkill}
                    disabled={!customValue.trim()}
                    className="px-3 py-2 bg-[#9C1E23] text-white text-sm rounded
                      hover:bg-[#7A171B] disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid={`custom-add-btn-${question.name}`}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </fieldset>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Threshold: choice lists with more options than this use ComboboxMultiSelect */
export { COMBOBOX_THRESHOLD };
