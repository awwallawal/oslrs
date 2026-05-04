/**
 * Story 9-11 AC#7 — Audit Log Detail Drawer.
 *
 * Slide-in panel from the right (shadcn Sheet) with the full audit event
 * payload, optional before/after diff for state-change events, and a
 * "preset filter" cross-reference link to surface that principal's recent
 * activity.
 *
 * CSP-safe JSON viewer: plain `<pre>{JSON.stringify(...)}</pre>`. No external
 * JSON-viewer libs that may eval inline scripts (Story 9-7/9-8 strict CSP).
 *
 * ESC closes; click-outside closes; focus returns to the originating row via
 * Radix Sheet semantics.
 */
import { useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../../components/ui/sheet';
import { Button } from '../../../components/ui/button';
import { Server, User as UserIcon, ExternalLink } from 'lucide-react';
import type { AuditLogRow, PrincipalType } from '../api/audit-log.api';

export interface AuditLogDetailDrawerProps {
  row: AuditLogRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Cross-reference action — invoked when the user clicks
   * "View all events from this principal in the last 7 days". The page
   * builds a preset filter and navigates the URL.
   */
  onPrincipalCrossReference: (
    principalId: string,
    principalType: PrincipalType,
  ) => void;
}

export default function AuditLogDetailDrawer({
  row,
  open,
  onOpenChange,
  onPrincipalCrossReference,
}: AuditLogDetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl"
        data-testid="audit-log-detail-drawer"
      >
        {row ? <DrawerContent row={row} onCrossReference={onPrincipalCrossReference} /> : null}
      </SheetContent>
    </Sheet>
  );
}

interface DrawerContentProps {
  row: AuditLogRow;
  onCrossReference: AuditLogDetailDrawerProps['onPrincipalCrossReference'];
}

function DrawerContent({ row, onCrossReference }: DrawerContentProps) {
  const principalIdForCross = row.actorId ?? row.consumerId ?? null;
  const canCrossReference = Boolean(principalIdForCross && row.principalType !== 'system');

  const diff = useMemo(() => extractDiff(row.details), [row.details]);
  const payloadString = useMemo(
    () => JSON.stringify(row.details ?? null, null, 2),
    [row.details],
  );

  return (
    <>
      <SheetHeader className="border-b border-neutral-200">
        <SheetTitle className="flex items-center gap-2 text-lg">
          {row.principalType === 'user' && (
            <UserIcon className="h-5 w-5 text-neutral-500" aria-hidden />
          )}
          {row.principalType === 'consumer' && (
            <Server className="h-5 w-5 text-neutral-500" aria-hidden />
          )}
          <span className="font-mono text-sm">{row.action}</span>
        </SheetTitle>
        <SheetDescription>
          {row.principalName} · {new Date(row.createdAt).toLocaleString()}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
        {/* Quick facts */}
        <div className="grid grid-cols-1 gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs">
          <Fact label="Event ID" value={row.id} mono />
          <Fact label="Principal" value={`${row.principalName} (${row.principalType})`} />
          {row.actorId && <Fact label="Actor ID" value={row.actorId} mono />}
          {row.consumerId && <Fact label="Consumer ID" value={row.consumerId} mono />}
          {row.targetResource && <Fact label="Target resource" value={row.targetResource} />}
          {row.targetId && <Fact label="Target ID" value={row.targetId} mono />}
          {row.ipAddress && <Fact label="IP address" value={row.ipAddress} mono />}
          {row.userAgent && <Fact label="User agent" value={row.userAgent} truncate />}
        </div>

        {/* Cross-reference link */}
        {canCrossReference && principalIdForCross && (
          <button
            type="button"
            onClick={() => onCrossReference(principalIdForCross, row.principalType)}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            data-testid="cross-reference-principal"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            View all events from this {row.principalType} in the last 7 days
          </button>
        )}

        {/* Before/After diff (state-change events) */}
        {diff && (
          <section data-testid="audit-log-diff">
            <h3 className="mb-2 text-sm font-medium text-neutral-900">
              State change
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Before</p>
                <pre className="max-h-64 overflow-auto rounded-md border border-neutral-200 bg-white p-3 text-xs text-neutral-800">
                  {JSON.stringify(diff.before, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">After</p>
                <pre className="max-h-64 overflow-auto rounded-md border border-neutral-200 bg-white p-3 text-xs text-neutral-800">
                  {JSON.stringify(diff.after, null, 2)}
                </pre>
              </div>
            </div>
            {diff.changedKeys.length > 0 && (
              <p className="mt-2 text-xs text-neutral-500">
                Changed:{' '}
                {diff.changedKeys.map((key, i) => (
                  <span key={key}>
                    <code className="rounded bg-amber-100 px-1 text-amber-800">
                      {key}
                    </code>
                    {i < diff.changedKeys.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </p>
            )}
          </section>
        )}

        {/* Full payload */}
        <section>
          <h3 className="mb-2 text-sm font-medium text-neutral-900">Event payload</h3>
          <pre
            className="max-h-96 overflow-auto rounded-md border border-neutral-200 bg-white p-3 text-xs text-neutral-800"
            data-testid="audit-log-payload"
          >
            {payloadString}
          </pre>
        </section>

        {/* Footer actions */}
        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(row.id)}>
            Copy event ID
          </Button>
        </div>
      </div>
    </>
  );
}

interface FactProps {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}
function Fact({ label, value, mono = false, truncate = false }: FactProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <span className="text-neutral-500">{label}</span>
      <span
        className={`col-span-2 ${mono ? 'font-mono text-[11px]' : ''} ${
          truncate ? 'truncate' : 'break-words'
        } text-neutral-800`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

interface DiffSummary {
  before: unknown;
  after: unknown;
  changedKeys: string[];
}

/**
 * Pull a before/after diff out of the audit-log details payload. Recognises the
 * canonical Epic 6 audit shapes:
 *   - `{ before: {...}, after: {...} }` (most state-change events)
 *   - `{ changes: { fieldName: { from, to } } }` (some bulk-update emitters)
 * Returns null when the details don't look like a state change.
 */
function extractDiff(details: unknown): DiffSummary | null {
  if (!details || typeof details !== 'object') return null;
  const obj = details as Record<string, unknown>;

  if (
    obj.before &&
    obj.after &&
    typeof obj.before === 'object' &&
    typeof obj.after === 'object'
  ) {
    const before = obj.before as Record<string, unknown>;
    const after = obj.after as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changedKeys = Array.from(allKeys).filter((key) => {
      const a = before[key];
      const b = after[key];
      return JSON.stringify(a) !== JSON.stringify(b);
    });
    return { before, after, changedKeys };
  }

  if (obj.changes && typeof obj.changes === 'object') {
    const changes = obj.changes as Record<string, { from?: unknown; to?: unknown }>;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    Object.entries(changes).forEach(([key, change]) => {
      before[key] = change.from;
      after[key] = change.to;
    });
    return { before, after, changedKeys: Object.keys(changes) };
  }

  return null;
}
