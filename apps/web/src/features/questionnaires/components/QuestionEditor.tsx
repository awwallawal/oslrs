import { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2, Plus } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { ConditionBuilder } from './ConditionBuilder';
import type { Question, Condition, ConditionGroup, QuestionType, ValidationRule, ValidationType } from '@oslsr/types';
import { questionTypes, validationTypes } from '@oslsr/types';

interface QuestionEditorProps {
  question: Question;
  onChange: (question: Question) => void;
  onDelete: () => void;
  availableFields: Array<{ name: string; label: string }>;
  choiceListKeys: string[];
  readOnly: boolean;
}

const TYPE_LABELS: Record<QuestionType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select_one: 'Select One',
  select_multiple: 'Select Multiple',
  note: 'Note',
  geopoint: 'Geopoint',
};

export function QuestionEditor({
  question,
  onChange,
  onDelete,
  availableFields,
  choiceListKeys,
  readOnly,
}: QuestionEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const showChoices = question.type === 'select_one' || question.type === 'select_multiple';

  const updateField = <K extends keyof Question>(key: K, value: Question[K]) => {
    onChange({ ...question, [key]: value });
  };

  const addValidationRule = () => {
    const rules = question.validation ?? [];
    const newRule: ValidationRule = { type: 'regex', value: '', message: '' };
    updateField('validation', [...rules, newRule]);
  };

  const updateValidationRule = (index: number, rule: ValidationRule) => {
    const rules = [...(question.validation ?? [])];
    rules[index] = rule;
    updateField('validation', rules);
  };

  const removeValidationRule = (index: number) => {
    const rules = (question.validation ?? []).filter((_, i) => i !== index);
    updateField('validation', rules.length > 0 ? rules : undefined);
  };

  return (
    <div className="border border-neutral-200 rounded-lg bg-white">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-neutral-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
            {TYPE_LABELS[question.type]}
          </span>
          <span className="text-sm font-medium text-neutral-900 truncate">
            {question.label || question.name || 'Untitled question'}
          </span>
          {question.required && (
            <span className="text-xs text-red-500">*</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!readOnly && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const name = question.label || question.name || 'Untitled question';
                if (window.confirm(`Delete question "${name}"?`)) onDelete();
              }}
              className="p-1 text-neutral-400 hover:text-red-600 rounded"
              title="Delete question"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-neutral-200 p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={question.type}
                onValueChange={(v) => updateField('type', v as QuestionType)}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {questionTypes.map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={question.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="question_name"
                disabled={readOnly}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Label</Label>
            <Input
              value={question.label}
              onChange={(e) => updateField('label', e.target.value)}
              placeholder="Question display text"
              disabled={readOnly}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={question.required}
              onCheckedChange={(checked) => updateField('required', checked)}
              disabled={readOnly}
            />
            <Label>Required</Label>
          </div>

          {showChoices && (
            <div className="space-y-2">
              <Label>Choice List</Label>
              <Select
                value={question.choices ?? ''}
                onValueChange={(v) => updateField('choices', v || undefined)}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a choice list" />
                </SelectTrigger>
                <SelectContent>
                  {choiceListKeys.map((key) => (
                    <SelectItem key={key} value={key}>{key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Skip Logic (Show When)</Label>
            <ConditionBuilder
              value={question.showWhen}
              onChange={(v) => updateField('showWhen', v as Condition | ConditionGroup | undefined)}
              availableFields={availableFields}
              readOnly={readOnly}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Validation Rules</Label>
              {!readOnly && (
                <button
                  type="button"
                  onClick={addValidationRule}
                  className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                >
                  <Plus className="w-3 h-3" />
                  Add Rule
                </button>
              )}
            </div>
            {(question.validation ?? []).map((rule, index) => (
              <div key={index} className="flex items-center gap-2 p-2 border border-neutral-100 rounded bg-neutral-50">
                <Select
                  value={rule.type}
                  onValueChange={(t) => updateValidationRule(index, { ...rule, type: t as ValidationType })}
                  disabled={readOnly}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {validationTypes.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={rule.value?.toString() ?? ''}
                  onChange={(e) => updateValidationRule(index, { ...rule, value: e.target.value })}
                  placeholder="Value"
                  className="w-24"
                  disabled={readOnly}
                />
                <Input
                  value={rule.message}
                  onChange={(e) => updateValidationRule(index, { ...rule, message: e.target.value })}
                  placeholder="Error message"
                  className="flex-1"
                  disabled={readOnly}
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeValidationRule(index)}
                    className="p-1 text-neutral-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
