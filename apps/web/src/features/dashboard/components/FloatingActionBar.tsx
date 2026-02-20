import { Button } from '../../../components/ui/button';
import { ShieldCheck, X } from 'lucide-react';

interface FloatingActionBarProps {
  selectedCount: number;
  onVerify: () => void;
  onClear: () => void;
}

/**
 * FloatingActionBar — fixed bottom bar for bulk verification actions.
 * Story 4.5 AC4.5.2: visible when 2+ items selected, hidden otherwise.
 */
export function FloatingActionBar({ selectedCount, onVerify, onClear }: FloatingActionBarProps) {
  if (selectedCount < 2) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white shadow-lg rounded-lg border border-neutral-200 px-6 py-3 flex items-center gap-4"
      data-testid="floating-action-bar"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="text-sm font-medium text-neutral-700">
        {selectedCount} selected
      </span>
      <Button
        onClick={onVerify}
        className="bg-green-600 hover:bg-green-700 text-white"
        data-testid="bulk-verify-button"
      >
        <ShieldCheck className="h-4 w-4 mr-1.5" />
        Verify Event
      </Button>
      <Button
        variant="ghost"
        onClick={onClear}
        data-testid="clear-selection-button"
      >
        <X className="h-4 w-4 mr-1.5" />
        Clear Selection
      </Button>
    </div>
  );
}
