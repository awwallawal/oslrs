import type { FlattenedQuestion } from '../api/form.api';
import { TextQuestionInput } from './TextQuestionInput';
import { NumberQuestionInput } from './NumberQuestionInput';
import { DateQuestionInput } from './DateQuestionInput';
import { SelectOneInput } from './SelectOneInput';
import { SelectMultipleInput } from './SelectMultipleInput';
import { GeopointInput } from './GeopointInput';
import { NoteDisplay } from './NoteDisplay';

export interface QuestionRendererProps {
  question: FlattenedQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
}

export function QuestionRenderer({
  question,
  value,
  onChange,
  error,
  disabled,
}: QuestionRendererProps) {
  const props = { question, value, onChange, error, disabled };

  switch (question.type) {
    case 'text':
      return <TextQuestionInput {...props} />;
    case 'number':
      return <NumberQuestionInput {...props} />;
    case 'date':
      return <DateQuestionInput {...props} />;
    case 'select_one':
      return <SelectOneInput {...props} />;
    case 'select_multiple':
      return <SelectMultipleInput {...props} />;
    case 'geopoint':
      return <GeopointInput {...props} />;
    case 'note':
      return <NoteDisplay {...props} />;
    default:
      return (
        <div className="text-red-600" data-testid="unsupported-type">
          Unsupported question type: {question.type}
        </div>
      );
  }
}
