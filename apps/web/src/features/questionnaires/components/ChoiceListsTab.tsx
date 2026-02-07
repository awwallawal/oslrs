import { Plus } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../components/ui/accordion';
import { ChoiceListEditor } from './ChoiceListEditor';
import type { NativeFormSchema, Choice } from '@oslsr/types';

interface ChoiceListsTabProps {
  schema: NativeFormSchema;
  onChange: (updates: Partial<NativeFormSchema>) => void;
  readOnly: boolean;
}

export function ChoiceListsTab({ schema, onChange, readOnly }: ChoiceListsTabProps) {
  const entries = Object.entries(schema.choiceLists);

  const updateChoiceList = (oldKey: string, newKey: string, choices: Choice[]) => {
    const updated = { ...schema.choiceLists };
    if (newKey !== oldKey) {
      delete updated[oldKey];
    }
    updated[newKey] = choices;
    onChange({ choiceLists: updated });
  };

  const deleteChoiceList = (key: string) => {
    // Check for questions referencing this choice list
    const referencingQuestions = schema.sections.flatMap(s =>
      s.questions.filter(q => q.choices === key).map(q => q.label || q.name || q.id)
    );

    let msg: string;
    if (referencingQuestions.length > 0) {
      msg = `Choice list "${key}" is referenced by ${referencingQuestions.length} question(s): ${referencingQuestions.join(', ')}.\n\nDelete anyway?`;
    } else {
      msg = `Delete choice list "${key}"?`;
    }
    if (!window.confirm(msg)) return;

    const updated = { ...schema.choiceLists };
    delete updated[key];
    onChange({ choiceLists: updated });
  };

  const addChoiceList = () => {
    let key = 'new_list';
    let counter = 1;
    while (schema.choiceLists[key]) {
      key = `new_list_${counter}`;
      counter++;
    }
    onChange({ choiceLists: { ...schema.choiceLists, [key]: [] } });
  };

  return (
    <div className="space-y-4">
      {entries.length === 0 ? (
        <div className="text-center py-8 text-neutral-500">
          <p className="font-medium">No choice lists yet</p>
          <p className="text-sm mt-1">Add a choice list for select questions.</p>
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {entries.map(([key, choices]) => (
            <AccordionItem key={key} value={key} className="border border-neutral-200 rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-neutral-900 font-mono text-sm">{key}</span>
                  <span className="text-xs text-neutral-400">
                    {choices.length} choice{choices.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ChoiceListEditor
                  listKey={key}
                  choices={choices}
                  onKeyChange={(newKey) => updateChoiceList(key, newKey, choices)}
                  onChoicesChange={(updated) => updateChoiceList(key, key, updated)}
                  onDelete={() => deleteChoiceList(key)}
                  readOnly={readOnly}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={addChoiceList}
          className="flex items-center gap-2 w-full justify-center py-3 border-2 border-dashed border-neutral-300 rounded-lg text-sm text-neutral-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Choice List
        </button>
      )}
    </div>
  );
}
