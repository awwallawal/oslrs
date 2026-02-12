import type { QuestionRendererProps } from './QuestionRenderer';

export function NoteDisplay({ question }: QuestionRendererProps) {
  return (
    <div className="space-y-2" data-testid={`note-${question.name}`}>
      <p className="text-base text-gray-900 leading-relaxed">{question.label}</p>
      {question.labelYoruba && (
        <p className="text-sm text-gray-500 italic">{question.labelYoruba}</p>
      )}
    </div>
  );
}
