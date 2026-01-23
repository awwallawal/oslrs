import { Search } from 'lucide-react';

interface SearchBoxProps {
  placeholder?: string;
  className?: string;
}

/**
 * SearchBox - Search input UI placeholder for Phase 1.
 *
 * Note: Phase 1 is UI only - no search functionality implemented.
 * Phase 2 will add actual search across FAQ and guides.
 */
function SearchBox({ placeholder = 'Search for answers...', className = '' }: SearchBoxProps) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
        <Search className="w-5 h-5 text-neutral-400" />
      </div>
      <input
        type="text"
        placeholder={placeholder}
        disabled
        className="w-full pl-12 pr-4 py-3 rounded-lg border border-neutral-300 bg-neutral-50 text-neutral-500 cursor-not-allowed focus:outline-none"
        aria-label="Search (coming soon)"
      />
      <span className="absolute inset-y-0 right-0 pr-4 flex items-center text-xs text-neutral-400">
        Coming soon
      </span>
    </div>
  );
}

export { SearchBox };
