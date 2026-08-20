/**
 * Story 13-51 (AC3.1 / AC3.2) — stop manufacturing the typos at capture, on the STAFF surfaces.
 *
 * ⛔ THIS IS NOT A FORMAT VALIDATOR, AND THAT IS DELIBERATE. Measured against
 * `validation/registration.schema.ts`'s exact rule (`z.string().email()`, zod 3.25.76) and against
 * the wizard's hand-rolled `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`:
 *
 *   | address                                       | format check |
 *   |-----------------------------------------------|--------------|
 *   | asirusakirat@gmail.come  ← the founding case  | **ACCEPT**   |
 *   | osegunlajide@gmail.con                        | **ACCEPT**   |
 *   | yusuffasiat@gmail.co                          | **ACCEPT**   |
 *   | fatomidejumoke@mail.com                       | **ACCEPT**   |
 *
 * `.come` is a syntactically valid address. So AC3.1 read as "validate the way the wizard does"
 * is a fix that cannot fire — the TYPO DICTIONARY is the load-bearing half, not the "consider"
 * half. A green format-validation test here would be [[pattern-test-that-passes-over-a-hole]] in
 * its purest form.
 *
 * ✅ REUSE, NOT REBUILD. `EmailTypoDetection` already renders "Did you mean…?" with a one-tap
 * accept and never auto-corrects; it has been wired on the public wizard since 9-12. This puts the
 * same component behind the enumerator/clerk questionnaire, which had no email field at all —
 * `QuestionRenderer` had no email type and an email question rendered as a plain text box with no
 * suggestion.
 *
 * ⚠️ NEVER A SILENT REWRITE. The suggestion is offered post-blur and applied only when the person
 * in front of the operator says yes. Never auto-correct a citizen's contact details without
 * showing them — that rule is why the `mail.com` disagreement (a REAL, live domain, which AC1.2
 * and SCP §10.10 classify differently) is safe to leave unresolved: whichever way the dictionary
 * leans, the citizen decides.
 */
import { useState } from 'react';
import { EmailTypoDetection } from '../../registration/components/EmailTypoDetection';
import { TextQuestionInput } from './TextQuestionInput';
import type { FlattenedQuestion } from '../api/form.api';

export interface EmailQuestionInputProps {
  question: FlattenedQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
}

export function EmailQuestionInput({ question, value, onChange, error, disabled }: EmailQuestionInputProps) {
  // Only surface a suggestion once the operator has left the field — otherwise a half-typed
  // "user@gma" is flagged while they are still typing it.
  const [blurredValue, setBlurredValue] = useState('');

  return (
    <div onBlur={() => setBlurredValue(typeof value === 'string' ? value : '')}>
      <TextQuestionInput
        question={question}
        value={value}
        onChange={(next) => {
          // Editing after a suggestion appeared should retract it, not leave a stale "did you
          // mean" pointing at the previous value.
          if (blurredValue) setBlurredValue('');
          onChange(next);
        }}
        error={error}
        disabled={disabled}
      />
      {!disabled && (
        <EmailTypoDetection
          email={blurredValue}
          onAccept={(corrected) => {
            onChange(corrected);
            setBlurredValue('');
          }}
        />
      )}
    </div>
  );
}

export default EmailQuestionInput;
