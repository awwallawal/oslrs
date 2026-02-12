interface ProgressBarProps {
  currentIndex: number;
  totalVisible: number;
  sections: { id: string; title: string }[];
  currentSectionId: string;
}

export function ProgressBar({
  currentIndex,
  totalVisible,
  sections,
  currentSectionId,
}: ProgressBarProps) {
  const fillPercent = totalVisible > 0 ? ((currentIndex + 1) / totalVisible) * 100 : 0;
  const currentSectionIndex = sections.findIndex((s) => s.id === currentSectionId);

  return (
    <div className="space-y-3" data-testid="progress-bar">
      {/* Horizontal fill bar */}
      <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#9C1E23] transition-all duration-300"
          style={{ width: `${fillPercent}%` }}
          role="progressbar"
          aria-valuenow={currentIndex + 1}
          aria-valuemin={1}
          aria-valuemax={totalVisible}
        />
      </div>

      {/* Section dots + text */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {sections.map((section, i) => (
            <div
              key={section.id}
              className={`w-2 h-2 rounded-full transition-colors ${
                i < currentSectionIndex
                  ? 'bg-[#15803D]'
                  : i === currentSectionIndex
                    ? 'bg-[#9C1E23]'
                    : 'bg-gray-200'
              }`}
              title={section.title}
            />
          ))}
        </div>
        <p className="text-sm text-gray-500">
          Question {currentIndex + 1} of {totalVisible} &bull; Section{' '}
          {currentSectionIndex + 1} of {sections.length}
        </p>
      </div>
    </div>
  );
}
