/**
 * Story 12-5 AC5 — one phrasing, used everywhere.
 *
 * These assertions are about WORDING as much as formatting: the whole story is
 * a label bug, so the strings that distinguish "respondents" from "submissions
 * with answers" are the fix and are worth pinning.
 */
import { describe, it, expect } from 'vitest';
import {
  TOTAL_RESPONDENTS_LABEL,
  WITH_ANSWERS_LABEL,
  WITH_ANSWERS_CAPTION,
  formatN,
  rangeTotalCaption,
  basedOnCaptionIfKnown,
  countedOverCaption,
  pctOfAnswersCaption,
  ofAnswersCaption,
  basedOnCaption,
} from '../registry-copy';

describe('registry-copy', () => {
  it('formats N in one shape', () => {
    expect(formatN(76)).toBe('N = 76');
  });

  it('groups thousands so a five-figure denominator stays readable', () => {
    expect(formatN(12345)).toBe('N = 12,345');
  });

  it('formats a zero denominator rather than blanking it', () => {
    expect(formatN(0)).toBe('N = 0');
  });

  it('names the two counts distinctly', () => {
    // The label that must never bind to the answers subset again.
    expect(TOTAL_RESPONDENTS_LABEL).toBe('Total Respondents');
    expect(WITH_ANSWERS_LABEL).toBe('With Answers');
    expect(WITH_ANSWERS_LABEL).not.toBe(TOTAL_RESPONDENTS_LABEL);
  });

  it('states a percentage with the denominator it divides by', () => {
    expect(pctOfAnswersCaption(44.7, 76)).toBe('44.7% of 76 respondents with answers');
  });

  it('rounds a percentage caption to one decimal place', () => {
    expect(pctOfAnswersCaption(26.34, 1247)).toBe('26.3% of 1,247 respondents with answers');
  });

  it('captions a non-percentage statistic with its base', () => {
    expect(ofAnswersCaption(76)).toBe('of 76 respondents with answers');
  });

  it('pluralises the counted-over caption', () => {
    expect(countedOverCaption(1)).toBe('counted over 1 respondent who answered');
    expect(countedOverCaption(70)).toBe('counted over 70 respondents who answered');
  });

  // ── 12-6 — the caption names the population the arithmetic actually used ──

  it('scopes the percentage caption to RESPONDENTS, now that the grain agrees', () => {
    // 12-5 wrote "submissions with answers" here ON PURPOSE: getRegistrySummary
    // counted FROM submissions while the "With Answers" card beside it counted
    // PEOPLE (12-4 measured 271 people against ~282 submissions on prod), so a
    // shared phrase would have shown two different numbers under one label.
    //
    // 12-6 re-pointed getRegistrySummary onto the canonical respondent-anchored
    // read — the exact condition 12-5 recorded for retiring the word. The two
    // populations are now ONE, so "submissions" would name a denominator the
    // arithmetic no longer uses: the same defect, pointed the other way.
    expect(pctOfAnswersCaption(44.7, 272)).toContain('respondents with answers');
    expect(pctOfAnswersCaption(44.7, 272)).not.toContain('submission');
    expect(ofAnswersCaption(272)).not.toContain('submission');
    expect(WITH_ANSWERS_CAPTION).not.toContain('submission');
    expect(WITH_ANSWERS_CAPTION).toContain('respondents');
  });

  it('gives a time series its own words instead of the N glyph', () => {
    // A count of registration EVENTS is not a denominator over people and is
    // not a subset of the registry total — it must not read as one.
    expect(rangeTotalCaption(1247)).toBe('1,247 registrations in the selected range');
    expect(rangeTotalCaption(1)).toBe('1 registration in the selected range');
    expect(rangeTotalCaption(1247)).not.toMatch(/^N = /);
  });

  // ── Review R4 — never publish "based on 0 responses" ──

  it('withholds a public denominator it does not actually have', () => {
    // The service defaults an absent denominator to 0, so 0 means "unknown"
    // here, not "nobody". Printing it under a real rate would be worse than
    // printing nothing.
    expect(basedOnCaptionIfKnown(0)).toBeNull();
    expect(basedOnCaptionIfKnown(null)).toBeNull();
    expect(basedOnCaptionIfKnown(undefined)).toBeNull();
    expect(basedOnCaptionIfKnown(271)).toBe('based on 271 responses');
  });

  it('publishes a public rate denominator as a bare figure, not prose', () => {
    // The 2026-08-18 operator ruling removed the narration of the answer-less
    // remainder from the public page; this must stay a plain count.
    expect(basedOnCaption(271)).toBe('based on 271 responses');
    expect(basedOnCaption(1)).toBe('based on 1 response');
    expect(basedOnCaption(271)).not.toMatch(/not on file|soft-launch|identity captured/i);
  });
});
