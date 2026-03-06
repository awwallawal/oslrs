import { useState, useEffect, useRef } from 'react';
import { Input } from '../../../components/ui/input';
import { Search } from 'lucide-react';

interface MarketplaceSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function MarketplaceSearchBar({ value, onChange }: MarketplaceSearchBarProps) {
  const [input, setInput] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const isInitialMount = useRef(true);

  useEffect(() => {
    setInput(value);
  }, [value]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      onChangeRef.current(input);
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="text"
        placeholder="Search skills (e.g., Electrician, Tailor...)"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        maxLength={200}
        className="pl-10"
        data-testid="marketplace-search-input"
      />
    </div>
  );
}
