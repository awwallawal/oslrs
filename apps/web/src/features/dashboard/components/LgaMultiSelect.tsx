/**
 * LGA Multi-Select Filter Component
 *
 * Story 5.6b: Dropdown with checkbox selection for filtering by LGA.
 * Shows selected count: "3 LGAs selected" or "All LGAs".
 */

import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '../../../components/ui/dropdown-menu';

interface LgaOption {
  id: string;
  name: string;
}

interface LgaMultiSelectProps {
  lgas: LgaOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function LgaMultiSelect({ lgas, selectedIds, onChange }: LgaMultiSelectProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return lgas;
    const lower = search.toLowerCase();
    return lgas.filter((l) => l.name.toLowerCase().includes(lower));
  }, [lgas, search]);

  const label = selectedIds.length === 0
    ? 'All LGAs'
    : `${selectedIds.length} LGA${selectedIds.length > 1 ? 's' : ''}`;

  const toggleLga = (id: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedIds, id]);
    } else {
      onChange(selectedIds.filter((i) => i !== id));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="min-w-[140px] justify-between"
          data-testid="lga-multi-select"
        >
          <span className="truncate">{label}</span>
          {selectedIds.length > 0 && (
            <X
              className="ml-1 h-3.5 w-3.5 shrink-0 text-neutral-400 hover:text-neutral-600"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              data-testid="lga-clear-selection"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 max-h-72 overflow-y-auto" align="start">
        <div className="px-2 py-1.5">
          <input
            type="text"
            placeholder="Search LGAs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-neutral-200 px-2 py-1 text-sm outline-none focus:border-neutral-400"
            data-testid="lga-search-input"
          />
        </div>
        <DropdownMenuSeparator />
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-sm text-neutral-400">No LGAs found</div>
        )}
        {filtered.map((lga) => (
          <DropdownMenuCheckboxItem
            key={lga.id}
            checked={selectedIds.includes(lga.id)}
            onCheckedChange={(checked) => toggleLga(lga.id, !!checked)}
            data-testid={`lga-option-${lga.id}`}
          >
            {lga.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
