import { useState, useRef, useEffect, useMemo, useCallback, useId } from 'react';
import type { QuestionRendererProps } from './QuestionRenderer';
import type { Choice } from '@oslsr/types';
import { skillSectorForSlug } from '@oslsr/types';

/**
 * Searchable multi-select with sector grouping, selected chips, and custom entry.
 * Used when a select_multiple question has a large choice list (>20 options).
 *
 * UX pattern:
 * 1. Selected chips at top (removable)
 * 2. Search input to filter
 * 3. Grouped dropdown (sector headers; all groups render expanded — Story 13-35
 *    code-review L3 corrected this comment, which claimed collapsible headers
 *    the component has never implemented. Collapsibility is a future story.)
 * 4. "Add custom skill" button for values not in the taxonomy
 * 5. A sticky "Done ({n} selected)" footer — the deliberate close affordance
 *    (Story 13-35 AC1). It sits OUTSIDE the `role="listbox"` element: a listbox
 *    may only own `option`/`group` children, so a button nested inside it is
 *    invalid ARIA and can be skipped entirely by AT option-navigation.
 */

/** Infer sector grouping from choice value prefixes or adjacent label patterns */
function groupChoices(choices: Choice[]): { sector: string; choices: Choice[] }[] {
  // Sector grouping is DERIVED from the canonical SKILL_TAXONOMY (source of truth)
  // via skillSectorForSlug. See packages/types/src/skills-taxonomy.ts (Story 13-22).
  // Custom / non-canonical values bucket under OTHER_SKILL_SECTOR.

  const grouped = new Map<string, Choice[]>();
  for (const choice of choices) {
    const sector = skillSectorForSlug(choice.value);
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
  // Story 13-35 (code-review M2) — the search input opens the panel on focus, so
  // returning focus to it after a close would immediately re-open. This latch
  // suppresses that one synchronous `onFocus`.
  const skipOpenOnFocusRef = useRef(false);
  // Story 13-35 (code-review L1) — `question.name` is not unique on a page that
  // renders the same schema twice; a React-generated id keeps aria-controls
  // pointing at THIS instance's listbox.
  const listboxId = `combobox-listbox-${useId()}`;

  /**
   * The single close path (Story 13-35 code-review M3 — the outside-click
   * handler used to inline its own copy, so the two could drift).
   * Also clears any abandoned custom-skill text, which previously survived a
   * close and reappeared pre-filled on re-open.
   *
   * `returnFocus` restores focus to the search input (code-review M2 — Escape or
   * Done unmounts the focused element, which otherwise dumps focus on <body> and
   * loses a keyboard user's position). Outside-click passes false: the user is
   * already interacting somewhere else and must not have focus yanked back.
   */
  const closeDropdown = useCallback((returnFocus = true) => {
    setIsOpen(false);
    setShowCustomInput(false);
    setCustomValue('');
    if (!returnFocus) return;
    skipOpenOnFocusRef.current = true;
    searchRef.current?.focus();
    skipOpenOnFocusRef.current = false;
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);

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

  /**
   * Story 13-35 AC1 — multi-select NEVER closes on pick.
   *
   * `refocusSearch` is deliberately modality-scoped (code-review H3). For a
   * pointer user, bouncing focus back to the search box is the fast multi-add
   * flow the AC asks for. For a KEYBOARD user it is a regression: focus would
   * jump off the option they just activated back to the top of the widget, so
   * picking a second skill costs a full re-Tab through the whole (150-option)
   * list. Keyboard activation therefore leaves focus on the option.
   */
  const toggleChoice = (choiceValue: string, refocusSearch: boolean) => {
    if (selected.includes(choiceValue)) {
      onChange(selected.filter((v) => v !== choiceValue));
    } else {
      onChange([...selected, choiceValue]);
    }
    if (refocusSearch) searchRef.current?.focus();
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
    <div
      className="space-y-2"
      ref={dropdownRef}
      // Story 13-35 AC1/AC4 — Escape closes the dropdown from anywhere within
      // (search box or an option button), mirroring the outside-click close.
      // code-review L2: when the custom-skill field is open, Escape cancels THAT
      // first (least-surprise, matches every other nested-input widget); a second
      // Escape then closes the dropdown.
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !isOpen) return;
        e.preventDefault();
        if (showCustomInput) {
          setShowCustomInput(false);
          setCustomValue('');
          searchRef.current?.focus();
          return;
        }
        closeDropdown();
      }}
    >
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
            role="combobox"
            aria-expanded={isOpen && !disabled}
            aria-controls={listboxId}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            placeholder={`Search ${choices.length} skills...`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => {
              // Suppressed only for the focus we ourselves restore on close
              // (code-review M2) — otherwise this would re-open instantly.
              if (skipOpenOnFocusRef.current) return;
              setIsOpen(true);
            }}
            // Focus alone can't re-open once we've closed while already focused,
            // so an explicit click must (code-review M2).
            onClick={() => setIsOpen(true)}
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
            className="mt-1 border border-gray-200 rounded-lg bg-white shadow-lg z-10"
            data-testid={`combobox-dropdown-${question.name}`}
          >
            {/* Story 13-35 (code-review M1) — the listbox owns ONLY option/group
                children, as ARIA requires. The custom-skill and Done blocks are
                siblings below it, not nested inside. */}
            <div
              id={listboxId}
              role="listbox"
              aria-multiselectable="true"
              aria-label={question.label}
              className="max-h-72 overflow-y-auto"
            >
            {groups.length === 0 ? (
              <div className="px-4 py-3 text-gray-500 text-sm">
                No skills match &ldquo;{search}&rdquo;
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.sector} role="group" aria-label={group.sector}>
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
                        role="option"
                        aria-selected={isSelected}
                        // `detail === 0` means the click came from Enter/Space on
                        // a focused button (keyboard), not a pointer — see H3.
                        onClick={(e) => toggleChoice(choice.value, e.detail > 0)}
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
            </div>

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

            {/* Story 13-35 AC1/AC4 — discoverable close affordance. The picker is
                genuinely multi-select (skills_possessed is plural), so it never
                closes on pick; "Done" is the deliberate exit. It now sits OUTSIDE
                the scrolling listbox (code-review M1), which also means it is
                always visible rather than only pinned to the bottom of the scroll
                area — the mobile reachability AC4 asks for. */}
            <div className="border-t border-gray-200 bg-white p-2">
              <button
                type="button"
                onClick={() => closeDropdown()}
                className="w-full px-4 py-2.5 bg-[#9C1E23] text-white text-sm font-medium
                  rounded-md hover:bg-[#7A171B] focus:outline-none focus-visible:ring-2
                  focus-visible:ring-[#9C1E23]/40 focus-visible:ring-offset-1"
                data-testid={`combobox-done-${question.name}`}
              >
                Done ({selected.length} selected)
              </button>
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
