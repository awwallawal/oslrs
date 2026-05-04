/**
 * Story 9-11 AC#3 — AuditLogFilter (Sally Custom Component #15).
 *
 * Multi-dimensional audit-log filter form. Owns "draft" state until the user
 * presses Apply. Reset clears all fields and re-applies the empty filter (which
 * the page interprets as "last 24h, all principals" per AC#2 default-window).
 *
 * Layout: form content only — the parent (`AuditLogPage`) handles the sidebar
 * vs sheet vs full-screen-modal responsive wrapper per AC#3.
 *
 * Renders five filter dimensions:
 *   - Principal type (3 checkboxes — at least one of User/Consumer required)
 *   - Actor autocomplete (300ms debounced; users + api_consumers)
 *   - Action multi-select chips
 *   - Target resource single-select
 *   - Date range (date inputs + 4 quick presets)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Server, User as UserIcon, X, AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  useDistinctActions,
  useDistinctTargetResources,
  usePrincipalSearch,
} from '../hooks/useAuditLogs';
import type {
  AuditLogFilter as AuditLogFilterValue,
  PrincipalType,
} from '../api/audit-log.api';

const ALL_PRINCIPALS: PrincipalType[] = ['user', 'consumer', 'system'];
const TARGET_RESOURCE_ALL = '__all__';

const DATE_PRESETS: Array<{ label: string; days: number }> = [
  { label: 'Today', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

function isoStartOfPresetDays(days: number): string {
  const now = new Date();
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function toDateInputValue(iso: string | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function fromDateInputValue(date: string, endOfDay = false): string | undefined {
  if (!date) return undefined;
  const parsed = new Date(`${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export interface AuditLogFilterProps {
  value: AuditLogFilterValue;
  onApply: (filter: AuditLogFilterValue) => void;
  onReset: () => void;
  /** Optional callback fired after Apply or Reset — used by the parent to close
   *  a Sheet on mobile. */
  onClose?: () => void;
}

export default function AuditLogFilter({
  value,
  onApply,
  onReset,
  onClose,
}: AuditLogFilterProps) {
  const [draft, setDraft] = useState<AuditLogFilterValue>(value);

  // Re-sync the draft when the external (URL-bound) value changes — e.g. page
  // navigation, browser back/forward, or a programmatic preset filter from a
  // detail-drawer cross-reference link.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const principals = draft.principalTypes ?? ALL_PRINCIPALS;
  const userChecked = principals.includes('user');
  const consumerChecked = principals.includes('consumer');
  const systemChecked = principals.includes('system');

  // AC#3 conflict guard: if BOTH User AND Consumer are unchecked, the filter is
  // logically empty for human/machine principal investigations. Show inline
  // warning + disable Apply.
  const principalConflict = !userChecked && !consumerChecked;

  const togglePrincipal = (type: PrincipalType, checked: boolean) => {
    setDraft((prev) => {
      const current = new Set(prev.principalTypes ?? ALL_PRINCIPALS);
      if (checked) {
        current.add(type);
      } else {
        current.delete(type);
      }
      const next = ALL_PRINCIPALS.filter((p) => current.has(p));
      return { ...prev, principalTypes: next.length === 3 ? undefined : next };
    });
  };

  const toggleAction = (action: string) => {
    setDraft((prev) => {
      const current = new Set(prev.actions ?? []);
      if (current.has(action)) {
        current.delete(action);
      } else {
        current.add(action);
      }
      const next = Array.from(current);
      return { ...prev, actions: next.length === 0 ? undefined : next };
    });
  };

  const setTargetResource = (resource: string) => {
    setDraft((prev) => ({
      ...prev,
      targetResource: resource === TARGET_RESOURCE_ALL ? undefined : resource,
    }));
  };

  const setFromDate = (date: string) => {
    setDraft((prev) => ({ ...prev, from: fromDateInputValue(date, false) }));
  };
  const setToDate = (date: string) => {
    setDraft((prev) => ({ ...prev, to: fromDateInputValue(date, true) }));
  };

  /**
   * R3-L1: surface inline warning when the user has set `from > to`. We do NOT
   * disable the Apply button — server gracefully returns an empty result for
   * an inverted range, and a soft warning preserves the user's ability to
   * deliberately submit (e.g. as a fast way to clear the table). The warning
   * just makes the silent-empty-results case loudly explainable.
   */
  const dateRangeInverted = !!(
    draft.from &&
    draft.to &&
    new Date(draft.from).getTime() > new Date(draft.to).getTime()
  );

  const applyPreset = (days: number) => {
    setDraft((prev) => ({
      ...prev,
      from: isoStartOfPresetDays(days),
      to: undefined,
    }));
  };

  const clearActor = () => setDraft((prev) => ({ ...prev, actorId: undefined }));

  const handleApply = () => {
    if (principalConflict) return;
    // Cursor is always reset on filter Apply per AC#5.
    onApply({ ...draft, cursor: undefined });
    onClose?.();
  };

  const handleReset = () => {
    onReset();
    onClose?.();
  };

  return (
    <form
      data-testid="audit-log-filter"
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        handleApply();
      }}
    >
      {/* Principal type */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-neutral-900">Principal type</legend>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={userChecked}
            onCheckedChange={(checked) => togglePrincipal('user', checked)}
            data-testid="principal-checkbox-user"
            aria-label="Filter on user principals"
          />
          <UserIcon className="h-4 w-4 text-neutral-500" aria-hidden />
          <span>User</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={consumerChecked}
            onCheckedChange={(checked) => togglePrincipal('consumer', checked)}
            data-testid="principal-checkbox-consumer"
            aria-label="Filter on consumer principals"
          />
          <Server className="h-4 w-4 text-neutral-500" aria-hidden />
          <span>Consumer</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={systemChecked}
            onCheckedChange={(checked) => togglePrincipal('system', checked)}
            data-testid="principal-checkbox-system"
            aria-label="Filter on system principals"
          />
          <span className="inline-block h-4 w-4 rounded-sm bg-neutral-200" aria-hidden />
          <span>System</span>
        </label>
        {principalConflict && (
          <div
            className="mt-1 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800"
            data-testid="principal-conflict-warning"
            role="status"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5" aria-hidden />
            <span>Pick at least one of User or Consumer to apply this filter.</span>
          </div>
        )}
      </fieldset>

      {/* Actor autocomplete */}
      <ActorAutocomplete
        actorId={draft.actorId}
        onPick={(id) => setDraft((prev) => ({ ...prev, actorId: id }))}
        onClear={clearActor}
      />

      {/* Action chips */}
      <ActionChips selected={draft.actions ?? []} onToggle={toggleAction} />

      {/* Target resource */}
      <TargetResourceSelect
        value={draft.targetResource}
        onChange={setTargetResource}
      />

      {/* Date range */}
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium text-neutral-900">Date range</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="audit-log-from" className="text-xs text-neutral-500">
              From
            </Label>
            <Input
              id="audit-log-from"
              type="date"
              data-testid="date-from"
              value={toDateInputValue(draft.from)}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="audit-log-to" className="text-xs text-neutral-500">
              To
            </Label>
            <Input
              id="audit-log-to"
              type="date"
              data-testid="date-to"
              value={toDateInputValue(draft.to)}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              data-testid={`date-preset-${preset.label.toLowerCase()}`}
              onClick={() => applyPreset(preset.days)}
              className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
            >
              {preset.label}
            </button>
          ))}
        </div>
        {/* R3-L1: inline warning for inverted date range (from > to). */}
        {dateRangeInverted && (
          <div
            className="mt-1 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800"
            data-testid="date-range-inverted-warning"
            role="status"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5" aria-hidden />
            <span>From date is later than To date. Server will return no results for this range.</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-2 flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
        <Button
          type="button"
          variant="ghost"
          onClick={handleReset}
          data-testid="filter-reset"
        >
          Reset
        </Button>
        <Button
          type="submit"
          disabled={principalConflict}
          data-testid="filter-apply"
        >
          Apply
        </Button>
      </div>
    </form>
  );
}

// ── ActorAutocomplete ──────────────────────────────────────────────────────

interface ActorAutocompleteProps {
  actorId: string | undefined;
  onPick: (id: string) => void;
  onClear: () => void;
}

function ActorAutocomplete({ actorId, onPick, onClear }: ActorAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 300ms debounce — Story Task 4.3.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Close on outside click — keeps the dropdown contained even when nested in a
  // Sheet portal.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data: results = [], isLoading } = usePrincipalSearch(debounced);

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      <Label htmlFor="audit-log-actor" className="text-sm font-medium text-neutral-900">
        Actor
      </Label>
      {actorId ? (
        <div
          className="flex items-center justify-between rounded-md border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-sm"
          data-testid="actor-pill"
        >
          <span className="truncate font-mono text-xs text-neutral-700">
            {actorId.slice(0, 8)}…
          </span>
          <button
            type="button"
            onClick={onClear}
            data-testid="actor-clear"
            aria-label="Clear actor filter"
            className="text-neutral-500 hover:text-neutral-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            id="audit-log-actor"
            type="text"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            data-testid="actor-search-input"
            autoComplete="off"
          />
          {open && debounced.trim().length > 0 && (
            <ul
              className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg"
              data-testid="actor-results"
              role="listbox"
            >
              {isLoading && (
                <li className="px-3 py-2 text-xs text-neutral-500">Searching…</li>
              )}
              {!isLoading && results.length === 0 && (
                <li
                  className="px-3 py-2 text-xs text-neutral-500"
                  data-testid="actor-results-empty"
                >
                  No matches
                </li>
              )}
              {!isLoading &&
                results.map((r) => (
                  <li key={`${r.type}:${r.id}`} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(r.id);
                        setQuery('');
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100"
                      data-testid={`actor-result-${r.id}`}
                    >
                      {r.type === 'user' ? (
                        <UserIcon className="h-4 w-4 text-neutral-500" aria-hidden />
                      ) : (
                        <Server className="h-4 w-4 text-neutral-500" aria-hidden />
                      )}
                      <span className="flex-1 truncate">{r.name}</span>
                      <span className="text-xs text-neutral-400">
                        {r.type === 'user' ? 'User' : 'Consumer'}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── ActionChips ────────────────────────────────────────────────────────────

interface ActionChipsProps {
  selected: string[];
  onToggle: (action: string) => void;
}

function ActionChips({ selected, onToggle }: ActionChipsProps) {
  const { data: actions = [], isLoading } = useDistinctActions();

  const sorted = useMemo(() => [...actions].sort(), [actions]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-medium text-neutral-900">Action</Label>
      {isLoading ? (
        <div className="flex flex-wrap gap-1.5" data-testid="action-chips-loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className="h-6 w-16 animate-pulse rounded-full bg-neutral-100"
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-neutral-500" data-testid="action-chips-empty">
          No actions yet
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5" data-testid="action-chips">
          {sorted.map((action) => {
            const isSelected = selectedSet.has(action);
            return (
              <button
                key={action}
                type="button"
                onClick={() => onToggle(action)}
                aria-pressed={isSelected}
                data-testid={`action-chip-${action}`}
                className={
                  isSelected
                    ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                    : 'rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-50'
                }
              >
                {action}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── TargetResourceSelect ───────────────────────────────────────────────────

interface TargetResourceSelectProps {
  value: string | undefined;
  onChange: (next: string) => void;
}

function TargetResourceSelect({ value, onChange }: TargetResourceSelectProps) {
  const { data: resources = [], isLoading } = useDistinctTargetResources();

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-medium text-neutral-900">Target resource</Label>
      <Select
        value={value ?? TARGET_RESOURCE_ALL}
        onValueChange={onChange}
        disabled={isLoading}
      >
        <SelectTrigger
          className="w-full"
          data-testid="target-resource-trigger"
          aria-label="Filter by target resource"
        >
          <SelectValue placeholder="All resources" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TARGET_RESOURCE_ALL}>All resources</SelectItem>
          {resources.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
