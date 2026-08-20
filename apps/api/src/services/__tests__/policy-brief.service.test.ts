/**
 * PolicyBriefService — Story 12-5 review follow-up R5.
 *
 * The brief had NO service-level test. That mattered here because 12-5's
 * backend scope exception exists for exactly one reason — "a rate published
 * without the count it came from is the defect this story exists to end" — and
 * the brief is the surface that gets printed and handed to the Ministry. It was
 * receiving `respondentsAnswering` and dropping it on the floor.
 *
 * PDFKit is faked down to the calls this service makes, so the assertions are
 * about WHAT THE DOCUMENT IS TOLD TO WRITE rather than about PDF bytes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Every string handed to `doc.text()`, in order. */
const written: string[] = [];

const fakeDoc = {
  page: { width: 595 },
  y: 100,
  on(event: string, cb: (arg?: unknown) => void) {
    // Emit synchronously so generatePolicyBrief's Promise settles.
    if (event === 'end') queueMicrotask(() => cb());
    return this;
  },
  text(value: string) { written.push(String(value)); return this; },
  font() { return this; },
  fontSize() { return this; },
  fillColor() { return this; },
  moveDown() { return this; },
  addPage() { return this; },
  save() { return this; },
  restore() { return this; },
  rect() { return this; },
  fill() { return this; },
  image() { return this; },
  end() { return this; },
  switchToPage() { return this; },
  moveTo() { return this; },
  lineTo() { return this; },
  stroke() { return this; },
  strokeColor() { return this; },
  lineWidth() { return this; },
};

// A plain function, not an arrow: the service calls `new PDFDocument(...)`,
// and returning an object from a constructor overrides `this`.
vi.mock('pdfkit', () => ({ default: function PDFDocumentMock() { return fakeDoc; } }));

const mockGetSkillsFrequency = vi.fn();

// Minimal but COMPLETE shapes — every field the brief's renderers dereference.
// The point of this file is the skills base, so everything else is empty rather
// than absent; an absent array would fail on `.filter` and mask the assertion.
vi.mock('../survey-analytics.service.js', () => ({
  SurveyAnalyticsService: {
    getInferentialInsights: () => Promise.resolve({
      chiSquare: [], correlations: [], groupComparisons: [], proportionCIs: [], forecast: null,
    }),
    getExtendedEquity: () => Promise.resolve({ educationAlignment: null }),
    getDemographics: () => Promise.resolve({ genderDistribution: [], educationDistribution: [] }),
    getEmployment: () => Promise.resolve({ workStatusBreakdown: [] }),
    getRegistrySummary: () => Promise.resolve({
      totalRespondents: 100, employedPct: 44.7, femalePct: 50, avgAge: 30,
    }),
    getSkillsFrequency: (...args: unknown[]) => mockGetSkillsFrequency(...args),
  },
}));

const { PolicyBriefService } = await import('../policy-brief.service.js');

const SKILLS = [
  { skill: 'welding', count: 30, percentage: 30 },
  { skill: 'tailoring', count: 20, percentage: 20 },
];

beforeEach(() => {
  written.length = 0;
  vi.clearAllMocks();
});

describe('PolicyBriefService — skills denominator (Story 12-5 R5)', () => {
  it('prints the base the skills percentages divide by', async () => {
    mockGetSkillsFrequency.mockResolvedValue({ skills: SKILLS, respondentsAnswering: 1234 });

    await PolicyBriefService.generatePolicyBrief({ type: 'system' });

    // The heading carries the base, so no reader has to work out what "30%" is
    // 30% OF. Thousands are grouped — this goes in front of officials.
    expect(written).toContain('Top Skills (n = 1,234 respondents answering)');
    expect(written).toContain('  welding');
  });

  it('states respondents-answering, NOT the sum of the skill counts', async () => {
    // One respondent picking five skills is ONE in the denominator and FIVE in
    // the counts. Summing the counts (50 here) would overstate the base badly —
    // which is precisely why the service now publishes it instead of letting
    // any consumer infer it.
    mockGetSkillsFrequency.mockResolvedValue({ skills: SKILLS, respondentsAnswering: 40 });

    await PolicyBriefService.generatePolicyBrief({ type: 'system' });

    expect(written).toContain('Top Skills (n = 40 respondents answering)');
    expect(written).not.toContain('Top Skills (n = 50 respondents answering)');
  });

  it('falls back to a bare heading rather than claiming a base of zero', async () => {
    mockGetSkillsFrequency.mockResolvedValue({ skills: [], respondentsAnswering: 0 });

    await PolicyBriefService.generatePolicyBrief({ type: 'system' });

    expect(written).toContain('Top Skills');
    expect(written.some((t) => t.includes('n = 0'))).toBe(false);
  });
});
