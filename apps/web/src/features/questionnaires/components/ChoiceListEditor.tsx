import { Plus, Trash2 } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import type { Choice } from '@oslsr/types';

interface ChoiceListEditorProps {
  listKey: string;
  choices: Choice[];
  onKeyChange: (newKey: string) => void;
  onChoicesChange: (choices: Choice[]) => void;
  onDelete: () => void;
  readOnly: boolean;
}

export function ChoiceListEditor({
  listKey,
  choices,
  onKeyChange,
  onChoicesChange,
  onDelete,
  readOnly,
}: ChoiceListEditorProps) {
  const updateChoice = (index: number, choice: Choice) => {
    const updated = [...choices];
    updated[index] = choice;
    onChoicesChange(updated);
  };

  const deleteChoice = (index: number) => {
    onChoicesChange(choices.filter((_, i) => i !== index));
  };

  const addChoice = () => {
    onChoicesChange([...choices, { label: '', value: '' }]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-2">
          <Label>List Key</Label>
          <Input
            value={listKey}
            onChange={(e) => onKeyChange(e.target.value)}
            placeholder="choice_list_name"
            disabled={readOnly}
          />
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={onDelete}
            className="mt-6 p-2 text-neutral-400 hover:text-red-600 rounded"
            title="Delete choice list"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Choices ({choices.length})</Label>
          {!readOnly && (
            <button
              type="button"
              onClick={addChoice}
              className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
            >
              <Plus className="w-3 h-3" />
              Add Choice
            </button>
          )}
        </div>

        {choices.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-600">Label</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-600">Value</th>
                  {!readOnly && (
                    <th className="w-10"></th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {choices.map((choice, index) => (
                  <tr key={index}>
                    <td className="py-1.5 px-3">
                      <Input
                        value={choice.label}
                        onChange={(e) => updateChoice(index, { ...choice, label: e.target.value })}
                        placeholder="Display label"
                        className="h-8 text-sm"
                        disabled={readOnly}
                      />
                    </td>
                    <td className="py-1.5 px-3">
                      <Input
                        value={choice.value}
                        onChange={(e) => updateChoice(index, { ...choice, value: e.target.value })}
                        placeholder="value"
                        className="h-8 text-sm"
                        disabled={readOnly}
                      />
                    </td>
                    {!readOnly && (
                      <td className="py-1.5 px-1">
                        <button
                          type="button"
                          onClick={() => deleteChoice(index)}
                          className="p-1 text-neutral-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {choices.length === 0 && (
          <p className="text-sm text-neutral-400 text-center py-3">
            No choices yet.
          </p>
        )}
      </div>
    </div>
  );
}
