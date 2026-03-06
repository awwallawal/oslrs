import { useState, useEffect, useRef } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import type { LgaItem } from '../../dashboard/api/export.api';

interface MarketplaceFiltersProps {
  lgaId: string;
  profession: string;
  experienceLevel: string;
  lgas: LgaItem[];
  onLgaChange: (value: string) => void;
  onProfessionChange: (value: string) => void;
  onExperienceLevelChange: (value: string) => void;
  onClear: () => void;
}

export function MarketplaceFilters({
  lgaId,
  profession,
  experienceLevel,
  lgas,
  onLgaChange,
  onProfessionChange,
  onExperienceLevelChange,
  onClear,
}: MarketplaceFiltersProps) {
  // Debounced internal state for text inputs (300ms, matching search bar)
  const [profInput, setProfInput] = useState(profession);
  const [expInput, setExpInput] = useState(experienceLevel);

  const onProfRef = useRef(onProfessionChange);
  onProfRef.current = onProfessionChange;
  const onExpRef = useRef(onExperienceLevelChange);
  onExpRef.current = onExperienceLevelChange;

  const isInitialProf = useRef(true);
  const isInitialExp = useRef(true);

  // Sync from parent (e.g., "Clear filters")
  useEffect(() => { setProfInput(profession); }, [profession]);
  useEffect(() => { setExpInput(experienceLevel); }, [experienceLevel]);

  // Debounce profession changes
  useEffect(() => {
    if (isInitialProf.current) { isInitialProf.current = false; return; }
    const t = setTimeout(() => onProfRef.current(profInput), 300);
    return () => clearTimeout(t);
  }, [profInput]);

  // Debounce experience level changes
  useEffect(() => {
    if (isInitialExp.current) { isInitialExp.current = false; return; }
    const t = setTimeout(() => onExpRef.current(expInput), 300);
    return () => clearTimeout(t);
  }, [expInput]);

  const hasFilters = lgaId || profInput || expInput;

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="w-48">
        <Select value={lgaId || 'all'} onValueChange={(v) => onLgaChange(v === 'all' ? '' : v)}>
          <SelectTrigger data-testid="lga-filter">
            <SelectValue placeholder="All LGAs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All LGAs</SelectItem>
            {lgas.map((lga) => (
              <SelectItem key={lga.code} value={lga.code}>
                {lga.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-40">
        <Input
          placeholder="Profession"
          value={profInput}
          onChange={(e) => setProfInput(e.target.value)}
          maxLength={100}
          data-testid="profession-filter"
        />
      </div>

      <div className="w-40">
        <Input
          placeholder="Experience level"
          value={expInput}
          onChange={(e) => setExpInput(e.target.value)}
          maxLength={50}
          data-testid="experience-filter"
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onClear} data-testid="clear-filters">
          Clear filters
        </Button>
      )}
    </div>
  );
}
