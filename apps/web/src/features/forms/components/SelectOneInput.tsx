import type { QuestionRendererProps } from './QuestionRenderer';

export function SelectOneInput({
  question,
  value,
  onChange,
  error,
  disabled,
}: QuestionRendererProps) {
  const choices = question.choices ?? [];

  return (
    <div className="space-y-2">
      <fieldset>
        <legend className="block text-base font-medium text-gray-900">
          {question.label}
          {question.required && <span className="text-red-600 ml-1">*</span>}
        </legend>
        {question.labelYoruba && (
          <p className="text-sm text-gray-500 italic">{question.labelYoruba}</p>
        )}
        <div
          className="mt-3 space-y-2"
          role="radiogroup"
          aria-label={question.label}
        >
          {choices.map((choice) => (
            <label
              key={choice.value}
              className={`flex items-center min-h-[48px] px-4 py-3 border rounded-lg cursor-pointer
                transition-colors
                ${value === choice.value
                  ? 'border-[#9C1E23] bg-[#9C1E23]/5'
                  : 'border-gray-300 bg-white hover:bg-gray-50'}
                ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="radio"
                name={question.name}
                value={choice.value}
                checked={value === choice.value}
                onChange={() => onChange(choice.value)}
                disabled={disabled}
                className="w-6 h-6 text-[#9C1E23] focus:ring-[#9C1E23]/20"
                data-testid={`radio-${question.name}-${choice.value}`}
              />
              <span className="ml-3 text-base text-gray-900">
                {choice.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
