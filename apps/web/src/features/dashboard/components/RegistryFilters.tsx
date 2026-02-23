/**
 * RegistryFilters — Filter controls for the respondent registry table
 *
 * Story 5.5 Task 6: 9 filter controls with role-based visibility.
 * Free text search hidden for Supervisors. LGA locked to own LGA for Supervisors.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { fetchLgas, type LgaItem } from '../api/export.api';
import { fetchFormList, fetchEnumeratorList, type FormListItem, type EnumeratorListItem } from '../api/registry.api';
import type { RespondentFilterParams } from '@oslsr/types';

interface RegistryFiltersProps {
  filters: RespondentFilterParams;
  onFilterChange: (filters: RespondentFilterParams) => void;
  userRole: string;
  userLgaId?: string | null;
  isOfficialRoute?: boolean;
}

const VERIFICATION_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'quarantined', label: 'Quarantined' },
];

const GENDER_OPTIONS = [
  { value: '', label: 'All Genders' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const SOURCE_OPTIONS = [
  { value: '', label: 'All Channels' },
  { value: 'enumerator', label: 'Enumerator' },
  { value: 'public', label: 'Public Self-Registration' },
  { value: 'clerk', label: 'Data Entry Clerk' },
];

const SEVERITY_OPTIONS = [
  { value: 'clean', label: 'Clean' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export function RegistryFilters({
  filters,
  onFilterChange,
  userRole,
  userLgaId,
  isOfficialRoute = false,
}: RegistryFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search || '');
  const [severityOpen, setSeverityOpen] = useState(false);
  const isPiiRole = userRole !== 'supervisor';
  const isSupervisor = userRole === 'supervisor';

  // Fetch reference data for dropdowns
  const { data: lgaList = [] } = useQuery<LgaItem[]>({
    queryKey: ['lgas'],
    queryFn: fetchLgas,
    staleTime: 300_000,
  });

  const { data: formList = [] } = useQuery<FormListItem[]>({
    queryKey: ['forms', 'published'],
    queryFn: fetchFormList,
    staleTime: 300_000,
  });

  const { data: enumeratorList = [] } = useQuery<EnumeratorListItem[]>({
    queryKey: ['enumerators'],
    queryFn: fetchEnumeratorList,
    staleTime: 300_000,
  });

  // Debounced search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.length >= 3 || searchInput.length === 0) {
        onFilterChange({ ...filters, search: searchInput || undefined, cursor: undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
    // Only re-run when searchInput changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const updateFilter = useCallback(
    (key: keyof RespondentFilterParams, value: string) => {
      onFilterChange({ ...filters, [key]: value || undefined, cursor: undefined });
    },
    [filters, onFilterChange],
  );

  const clearAllFilters = useCallback(() => {
    setSearchInput('');
    onFilterChange({
      pageSize: filters.pageSize,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
  }, [filters.pageSize, filters.sortBy, filters.sortOrder, onFilterChange]);

  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.lgaId ||
      filters.gender ||
      filters.source ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.verificationStatus ||
      filters.severity ||
      filters.formId ||
      filters.enumeratorId ||
      filters.search
    );
  }, [filters]);

  const selectClass = `h-9 rounded-md border border-gray-300 bg-white px-3 text-sm ${
    isOfficialRoute ? 'focus:ring-[#9C1E23]' : 'focus:ring-neutral-900'
  } focus:ring-1 focus:outline-none`;

  return (
    <div className="space-y-3" data-testid="registry-filters">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {/* LGA */}
        <select
          value={isSupervisor ? (userLgaId || '') : (filters.lgaId || '')}
          onChange={(e) => updateFilter('lgaId', e.target.value)}
          className={selectClass}
          disabled={isSupervisor}
          data-testid="filter-lga"
        >
          <option value="">All LGAs</option>
          {lgaList.map((lga) => (
            <option key={lga.code} value={lga.code}>
              {lga.name}
            </option>
          ))}
        </select>

        {/* Gender */}
        <select
          value={filters.gender || ''}
          onChange={(e) => updateFilter('gender', e.target.value)}
          className={selectClass}
          data-testid="filter-gender"
        >
          {GENDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Source Channel */}
        <select
          value={filters.source || ''}
          onChange={(e) => updateFilter('source', e.target.value)}
          className={selectClass}
          data-testid="filter-source"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Date From */}
        <input
          type="date"
          value={filters.dateFrom ? filters.dateFrom.split('T')[0] : ''}
          onChange={(e) =>
            updateFilter('dateFrom', e.target.value ? new Date(e.target.value).toISOString() : '')
          }
          className={selectClass}
          data-testid="filter-date-from"
          placeholder="From date"
        />

        {/* Date To */}
        <input
          type="date"
          value={filters.dateTo ? filters.dateTo.split('T')[0] : ''}
          onChange={(e) =>
            updateFilter('dateTo', e.target.value ? new Date(e.target.value + 'T23:59:59.999Z').toISOString() : '')
          }
          className={selectClass}
          data-testid="filter-date-to"
          placeholder="To date"
        />

        {/* Verification Status */}
        <select
          value={filters.verificationStatus || ''}
          onChange={(e) => updateFilter('verificationStatus', e.target.value)}
          className={selectClass}
          data-testid="filter-verification-status"
        >
          {VERIFICATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Fraud Severity (multi-select via checkboxes) */}
        <div className="relative" data-testid="filter-severity">
          <button
            type="button"
            onClick={() => setSeverityOpen((v) => !v)}
            className={`${selectClass} w-full text-left flex items-center justify-between`}
          >
            <span className="truncate">
              {filters.severity
                ? filters.severity.split(',').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')
                : 'All Severities'}
            </span>
            <ChevronDown className="w-4 h-4 shrink-0 ml-1 text-gray-400" />
          </button>
          {severityOpen && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg py-1">
              {SEVERITY_OPTIONS.map((opt) => {
                const selected = (filters.severity || '').split(',').filter(Boolean);
                const isChecked = selected.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        const next = isChecked
                          ? selected.filter((s) => s !== opt.value)
                          : [...selected, opt.value];
                        updateFilter('severity', next.join(','));
                        if (next.length === 0) setSeverityOpen(false);
                      }}
                      className="rounded border-gray-300"
                      data-testid={`severity-${opt.value}`}
                    />
                    {opt.label}
                  </label>
                );
              })}
              {filters.severity && (
                <button
                  type="button"
                  onClick={() => { updateFilter('severity', ''); setSeverityOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100"
                >
                  Clear selection
                </button>
              )}
            </div>
          )}
        </div>

        {/* Form/Questionnaire */}
        <select
          value={filters.formId || ''}
          onChange={(e) => updateFilter('formId', e.target.value)}
          className={selectClass}
          data-testid="filter-form"
        >
          <option value="">All Forms</option>
          {formList.map((form) => (
            <option key={form.id} value={form.id}>
              {form.title}
            </option>
          ))}
        </select>

        {/* Enumerator */}
        <select
          value={filters.enumeratorId || ''}
          onChange={(e) => updateFilter('enumeratorId', e.target.value)}
          className={selectClass}
          data-testid="filter-enumerator"
        >
          <option value="">All Enumerators</option>
          {enumeratorList.map((e) => (
            <option key={e.id} value={e.id}>
              {e.fullName}
            </option>
          ))}
        </select>

        {/* Free Text Search — PII roles only */}
        {isPiiRole && (
          <div className="relative col-span-2 md:col-span-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or NIN (min 3 chars)"
              className={`${selectClass} w-full pl-8 pr-8`}
              data-testid="filter-search"
              minLength={3}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          data-testid="clear-filters"
        >
          <X className="w-4 h-4 mr-1" />
          Clear Filters
        </Button>
      )}
    </div>
  );
}
