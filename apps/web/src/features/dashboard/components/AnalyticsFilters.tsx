/**
 * Analytics Global Filter Controls
 *
 * Story 8.2 AC#5: LGA dropdown, date range picker, source selector.
 * Filter changes propagate to parent via onChange callback.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLgas } from '../api/export.api';
import type { AnalyticsQueryParams } from '@oslsr/types';

interface AnalyticsFiltersProps {
  value: AnalyticsQueryParams;
  onChange: (params: AnalyticsQueryParams) => void;
  className?: string;
  showSource?: boolean;
}

const SOURCE_OPTIONS = [
  { label: 'All Sources', value: '' },
  { label: 'Enumerator', value: 'enumerator' },
  { label: 'Public', value: 'public' },
  { label: 'Clerk', value: 'clerk' },
];

export function AnalyticsFilters({ value, onChange, className, showSource = true }: AnalyticsFiltersProps) {
  const { data: lgas } = useQuery({
    queryKey: ['lgas'],
    queryFn: fetchLgas,
    staleTime: 300_000,
  });

  // Debounce date changes — use refs to avoid stale closures
  const [localDateFrom, setLocalDateFrom] = useState(value.dateFrom ?? '');
  const [localDateTo, setLocalDateTo] = useState(value.dateTo ?? '');

  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (localDateFrom !== (valueRef.current.dateFrom ?? '') || localDateTo !== (valueRef.current.dateTo ?? '')) {
        onChangeRef.current({
          ...valueRef.current,
          dateFrom: localDateFrom || undefined,
          dateTo: localDateTo || undefined,
        });
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [localDateFrom, localDateTo]);

  // Sync external changes
  useEffect(() => {
    setLocalDateFrom(value.dateFrom ?? '');
    setLocalDateTo(value.dateTo ?? '');
  }, [value.dateFrom, value.dateTo]);

  const handleLgaChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...value, lgaId: e.target.value || undefined });
  }, [value, onChange]);

  const handleSourceChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...value, source: e.target.value || undefined });
  }, [value, onChange]);

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className ?? ''}`} data-testid="analytics-filters">
      {/* LGA Dropdown */}
      <select
        value={value.lgaId ?? ''}
        onChange={handleLgaChange}
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9C1E23]/30"
        aria-label="Filter by LGA"
      >
        <option value="">All LGAs</option>
        {(lgas ?? []).map((lga) => (
          <option key={lga.code} value={lga.code}>
            {lga.name}
          </option>
        ))}
      </select>

      {/* Date From */}
      <input
        type="date"
        value={localDateFrom}
        onChange={(e) => setLocalDateFrom(e.target.value)}
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9C1E23]/30"
        aria-label="Date from"
        placeholder="From"
      />

      {/* Date To */}
      <input
        type="date"
        value={localDateTo}
        onChange={(e) => setLocalDateTo(e.target.value)}
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9C1E23]/30"
        aria-label="Date to"
        placeholder="To"
      />

      {/* Source Selector */}
      {showSource && (
        <select
          value={value.source ?? ''}
          onChange={handleSourceChange}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9C1E23]/30"
          aria-label="Filter by source"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
