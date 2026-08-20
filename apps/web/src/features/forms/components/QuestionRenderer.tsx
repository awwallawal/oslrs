import type { FlattenedQuestion } from '../api/form.api';
import { TextQuestionInput } from './TextQuestionInput';
import { EmailQuestionInput } from './EmailQuestionInput';
import { NumberQuestionInput } from './NumberQuestionInput';
import { DateQuestionInput } from './DateQuestionInput';
import { SelectOneInput } from './SelectOneInput';
import { SelectMultipleInput } from './SelectMultipleInput';
import { ComboboxMultiSelect, COMBOBOX_THRESHOLD } from './ComboboxMultiSelect';
import { GeopointInput } from './GeopointInput';
import { NoteDisplay } from './NoteDisplay';
import { WIZARD_PROVIDED_FIELD_NAMES } from '../../registration/lib/wizard-provided-field-names';

/**
 * Story 13-51 — the question names that carry an email address.
 *
 * ⚠️ IMPORTED FROM THE CANONICAL SET, NOT COPIED (code-review L5). This was a hand-written
 * `new Set(['email', 'email_address'])` whose docblock justified the copy as keeping the forms
 * feature free of a registration-feature dependency — while the component it renders
 * (`EmailQuestionInput`) imports `EmailTypoDetection` from that very feature. The dependency was
 * already there, so the copy bought nothing and could only drift: add a third carrier name to
 * `WIZARD_PROVIDED_FIELD_NAMES` and the wizard would dedup it while this renderer silently
 * stopped offering the suggestion on it.
 */
const EMAIL_CARRIER_NAMES: ReadonlySet<string> = new Set(WIZARD_PROVIDED_FIELD_NAMES.email);

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

  // Story 13-51 (AC3.1) — an email carrier question gets the typo suggestion the public wizard
  // has had since 9-12. Detected BY NAME because the published form schemas have no `email`
  // question type: `wizard-provided-field-names.ts` fixes the carrier names, and an email question
  // authored today arrives as plain `text`. Keying on the name means existing published forms pick
  // this up with no re-upload — and a re-upload mints a NEW form row, which is its own hazard.
  if (question.type === 'text' && EMAIL_CARRIER_NAMES.has(question.name?.trim().toLowerCase())) {
    return <EmailQuestionInput {...props} />;
  }

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
      if ((question.choices?.length ?? 0) > COMBOBOX_THRESHOLD) {
        return <ComboboxMultiSelect {...props} />;
      }
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
