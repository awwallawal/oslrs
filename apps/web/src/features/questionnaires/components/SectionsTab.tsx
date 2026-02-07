import { Plus } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../components/ui/accordion';
import { SectionEditor } from './SectionEditor';
import type { NativeFormSchema, Section } from '@oslsr/types';

interface SectionsTabProps {
  schema: NativeFormSchema;
  onChange: (updates: Partial<NativeFormSchema>) => void;
  readOnly: boolean;
}

export function SectionsTab({ schema, onChange, readOnly }: SectionsTabProps) {
  const choiceListKeys = Object.keys(schema.choiceLists);

  // Build available fields from all questions across all sections
  const availableFields = schema.sections.flatMap((section) =>
    section.questions.map((q) => ({ name: q.name, label: q.label }))
  );

  const updateSection = (index: number, section: Section) => {
    const sections = [...schema.sections];
    sections[index] = section;
    onChange({ sections });
  };

  const deleteSection = (index: number) => {
    onChange({ sections: schema.sections.filter((_, i) => i !== index) });
  };

  const addSection = () => {
    const newSection: Section = {
      id: uuidv7(),
      title: '',
      questions: [],
    };
    onChange({ sections: [...schema.sections, newSection] });
  };

  return (
    <div className="space-y-4">
      {schema.sections.length === 0 ? (
        <div className="text-center py-8 text-neutral-500">
          <p className="font-medium">No sections yet</p>
          <p className="text-sm mt-1">Add a section to start building your form.</p>
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {schema.sections.map((section, index) => (
            <AccordionItem key={section.id} value={section.id} className="border border-neutral-200 rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-neutral-900">
                    {section.title || 'Untitled Section'}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {section.questions.length} question{section.questions.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <SectionEditor
                  section={section}
                  onChange={(s) => updateSection(index, s)}
                  onDelete={() => deleteSection(index)}
                  availableFields={availableFields}
                  choiceListKeys={choiceListKeys}
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
          onClick={addSection}
          className="flex items-center gap-2 w-full justify-center py-3 border-2 border-dashed border-neutral-300 rounded-lg text-sm text-neutral-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Section
        </button>
      )}
    </div>
  );
}
