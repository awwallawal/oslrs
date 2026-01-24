import { cn } from '../../../lib/utils';

interface CategoryTabsProps {
  categories: string[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

/**
 * CategoryTabs - Tab component for FAQ category filtering.
 *
 * Accessible tabs with keyboard navigation support.
 */
function CategoryTabs({ categories, activeCategory, onCategoryChange }: CategoryTabsProps) {
  return (
    <div
      className="flex flex-wrap gap-2 mb-8"
      role="tablist"
      aria-label="FAQ categories"
    >
      {categories.map((category) => (
        <button
          key={category}
          onClick={() => onCategoryChange(category)}
          role="tab"
          aria-selected={activeCategory === category}
          aria-controls={`faq-panel-${category.toLowerCase().replace(/\s+/g, '-')}`}
          className={cn(
            'px-4 py-2 rounded-full text-sm font-medium transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
            activeCategory === category
              ? 'bg-primary-600 text-white'
              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          )}
        >
          {category}
        </button>
      ))}
    </div>
  );
}

export { CategoryTabs };
