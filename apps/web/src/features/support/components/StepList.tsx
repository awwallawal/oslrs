interface Step {
  title: string;
  description: string;
}

interface StepListProps {
  steps: Step[];
}

/**
 * StepList - Numbered step list component for guide pages.
 *
 * Displays numbered steps with clear visual hierarchy.
 */
function StepList({ steps }: StepListProps) {
  return (
    <ol className="space-y-6">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-600 font-semibold flex items-center justify-center text-sm">
            {index + 1}
          </div>
          <div className="flex-1 pt-1">
            <h3 className="font-semibold text-neutral-900 mb-1">{step.title}</h3>
            <p className="text-neutral-600 text-sm">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export { StepList };
export type { Step, StepListProps };
