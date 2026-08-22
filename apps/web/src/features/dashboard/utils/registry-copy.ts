/**
 * Registry copy + denominator formatting — Story 12-5 (AC5).
 *
 * ONE place for the respondents-vs-answers wording and the N label, so the
 * headline, the registry strip and all ~41 charts say the same thing in the
 * same shape. The bug this story fixes was not a broken query — it was a label:
 * a count of answer-bearing submissions rendered under the words "Total
 * Respondents", which made 63 of 139 registered people invisible. Wording that
 * lives in one module cannot drift back into that on the next surface someone
 * adds.
 *
 * Rule of thumb for anything added here: a number never appears without saying
 * what it counts, and a percentage never appears without the count it divides
 * by.
 */

/** The honest registry total — distinct PEOPLE. Never bind this to a submission count. */
export const TOTAL_RESPONDENTS_LABEL = 'Total Respondents';

/** The subset whose questionnaire answers are on file. */
export const WITH_ANSWERS_LABEL = 'With Answers';

/** Sub-caption for the "With Answers" figure. */
export const WITH_ANSWERS_CAPTION = 'respondents whose answers we hold';

/**
 * The N label rendered under a chart title. One format, everywhere.
 *
 * @example formatN(76) // "N = 76"
 */
export function formatN(n: number): string {
  return `N = ${n.toLocaleString()}`;
}

/**
 * Plain-language statement of what a chart's N was counted over.
 * Used as the chart-header subtitle beside {@link formatN}.
 */
export function countedOverCaption(n: number): string {
  return `counted over ${n.toLocaleString()} ${n === 1 ? 'respondent' : 'respondents'} who answered`;
}

/**
 * Sub-caption for a percentage computed over the answer-bearing RESPONDENTS,
 * so a reader cannot divide by the registry total by mistake.
 *
 * ── Why this used to say "submissions", and why it no longer does (12-6) ─────
 * 12-5 deliberately wrote "N **submissions** with answers" here, because
 * `getRegistrySummary` counted `FROM submissions` while the "With Answers" card
 * beside it counted PEOPLE. Two genuinely different populations under one
 * phrase would have rebuilt, on the fixing page, the very defect being fixed —
 * so each population was named instead.
 *
 * Story 12-6 (inherited 12-5 R2) re-pointed `getRegistrySummary` onto the
 * canonical respondent-anchored read, which is the condition 12-5 wrote down
 * for retiring that word: *"When 12-4 repoints getRegistrySummary onto the
 * canonical respondent-anchored read, the two collapse into one number and this
 * wording can lose the word 'submissions'."* They have collapsed. Keeping
 * "submissions" now would name a population the arithmetic no longer uses —
 * the same class of error, pointed the other way.
 *
 * ⚠️ So this wording is NOT cosmetic and must not be edited independently of the
 * service. It asserts which population the percentage divides by. If anything
 * ever moves an aggregate back onto the submission grain, this string is part
 * of that change.
 *
 * @example pctOfAnswersCaption(44.7, 272) // "44.7% of 272 respondents with answers"
 */
export function pctOfAnswersCaption(pct: number, respondentsWithAnswers: number): string {
  return `${pct.toFixed(1)}% of ${respondentsWithAnswers.toLocaleString()} respondents with answers`;
}

/**
 * Sub-caption for a non-percentage statistic (e.g. an average) computed over
 * the answer-bearing respondents. Same population note as
 * {@link pctOfAnswersCaption}.
 *
 * @example ofAnswersCaption(272) // "of 272 respondents with answers"
 */
export function ofAnswersCaption(respondentsWithAnswers: number): string {
  return `of ${respondentsWithAnswers.toLocaleString()} respondents with answers`;
}

/**
 * Caption for a TIME SERIES, which has no denominator over people.
 *
 * A trend chart counts registration EVENTS in the selected window; rendering
 * that under the same "N = …" glyph the distribution charts use invites a
 * reader to compare it with the registry total, which it is not a subset of.
 * So it gets its own words and says which window it belongs to.
 *
 * @example rangeTotalCaption(1247) // "1,247 registrations in the selected range"
 */
export function rangeTotalCaption(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? 'registration' : 'registrations'} in the selected range`;
}

/**
 * The n a published rate was computed from, for the public insights page.
 *
 * ⚠️ Deliberately NOT prose. The operator ruling of 2026-08-18 removed the
 * MethodologyNote narration of the answer-less remainder from the public page
 * and guards its absence with a regression test; this publishes the denominator
 * as a bare, checkable figure beside its rate, which is what ruling R-E asked
 * for, without reintroducing that narration.
 *
 * @example basedOnCaption(271) // "based on 271 responses"
 */
export function basedOnCaption(n: number): string {
  return `based on ${n.toLocaleString()} ${n === 1 ? 'response' : 'responses'}`;
}

/**
 * {@link basedOnCaption}, but returns null when there is no denominator worth
 * publishing — and every PUBLIC surface must use this one.
 *
 * The service defaults each entry of `rateDenominators` to `Number(… ?? 0)`, so
 * a rate that clears the suppression threshold while its own `n` comes back
 * missing would otherwise print **"based on 0 responses"** underneath a real
 * percentage, on the page a radio audience and an assessor read. A denominator
 * we do not have is not the number zero; saying nothing is the honest render.
 */
export function basedOnCaptionIfKnown(n: number | null | undefined): string | null {
  if (n == null || n <= 0) return null;
  return basedOnCaption(n);
}
