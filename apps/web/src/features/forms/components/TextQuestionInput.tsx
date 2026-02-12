import type { QuestionRendererProps } from './QuestionRenderer';

export function TextQuestionInput({
  question,
  value,
  onChange,
  error,
  disabled,
}: QuestionRendererProps) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={question.name}
        className="block text-base font-medium text-gray-900"
      >
        {question.label}
        {question.required && <span className="text-red-600 ml-1">*</span>}
      </label>
      {question.labelYoruba && (
        <p className="text-sm text-gray-500 italic">{question.labelYoruba}</p>
      )}
      <input
        id={question.name}
        type="text"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full min-h-[48px] px-4 py-3 text-base border rounded-lg
          focus:outline-none focus:ring-2 focus:ring-[#9C1E23]/20 focus:border-[#9C1E23]
          ${error ? 'border-red-500' : 'border-gray-300'}
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${question.name}-error` : undefined}
        data-testid={`input-${question.name}`}
      />
      {error && (
        <p
          id={`${question.name}-error`}
          className="text-sm text-red-600"
          role="alert"
        >
          {error}
        </p>
      )}
      {!error && value != null && value !== '' && (
        <span className="text-green-600 text-sm" aria-label="Valid">
          ✓
        </span>
      )}
    </div>
  );
}
