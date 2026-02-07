import { Plus, Trash2 } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { ConditionBuilder } from './ConditionBuilder';
import { QuestionEditor } from './QuestionEditor';
import type { Section, Question, Condition, ConditionGroup } from '@oslsr/types';

interface SectionEditorProps {
  section: Section;
  onChange: (section: Section) => void;
  onDelete: () => void;
  availableFields: Array<{ name: string; label: string }>;
  choiceListKeys: string[];
  readOnly: boolean;
}

export function SectionEditor({
  section,
  onChange,
  onDelete,
  availableFields,
  choiceListKeys,
  readOnly,
}: SectionEditorProps) {
  const updateQuestion = (index: number, question: Question) => {
    const questions = [...section.questions];
    questions[index] = question;
    onChange({ ...section, questions });
  };

  const deleteQuestion = (index: number) => {
    onChange({ ...section, questions: section.questions.filter((_, i) => i !== index) });
  };

  const addQuestion = () => {
    const newQuestion: Question = {
      id: uuidv7(),
      type: 'text',
      name: '',
      label: '',
      required: false,
    };
    onChange({ ...section, questions: [...section.questions, newQuestion] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-2">
          <Label>Section Title</Label>
          <Input
            value={section.title}
            onChange={(e) => onChange({ ...section, title: e.target.value })}
            placeholder="Section title"
            disabled={readOnly}
          />
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              const name = section.title || 'Untitled Section';
              const qCount = section.questions.length;
              const msg = qCount > 0
                ? `Delete section "${name}" and its ${qCount} question${qCount !== 1 ? 's' : ''}?`
                : `Delete section "${name}"?`;
              if (window.confirm(msg)) onDelete();
            }}
            className="mt-6 p-2 text-neutral-400 hover:text-red-600 rounded"
            title="Delete section"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        <Label>Section Skip Logic (Show When)</Label>
        <ConditionBuilder
          value={section.showWhen}
          onChange={(v) => onChange({ ...section, showWhen: v as Condition | ConditionGroup | undefined })}
          availableFields={availableFields}
          readOnly={readOnly}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Questions ({section.questions.length})</Label>
          {!readOnly && (
            <button
              type="button"
              onClick={addQuestion}
              className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700"
            >
              <Plus className="w-4 h-4" />
              Add Question
            </button>
          )}
        </div>
        {section.questions.map((question, index) => (
          <QuestionEditor
            key={question.id}
            question={question}
            onChange={(q) => updateQuestion(index, q)}
            onDelete={() => deleteQuestion(index)}
            availableFields={availableFields}
            choiceListKeys={choiceListKeys}
            readOnly={readOnly}
          />
        ))}
        {section.questions.length === 0 && (
          <p className="text-sm text-neutral-400 text-center py-4">
            No questions yet. Click "Add Question" to get started.
          </p>
        )}
      </div>
    </div>
  );
}
