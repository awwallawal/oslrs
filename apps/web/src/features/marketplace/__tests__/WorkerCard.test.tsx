// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MarketplaceSearchResultItem } from '@oslsr/types';
import { WorkerCard } from '../components/WorkerCard';

expect.extend(matchers);

afterEach(() => cleanup());

function makeProfile(overrides: Partial<MarketplaceSearchResultItem> = {}): MarketplaceSearchResultItem {
  return {
    id: '018e1234-5678-7000-8000-000000000001',
    profession: 'Electrician',
    skills: ['electrical', 'solar'],
    lgaName: 'Ibadan North',
    experienceLevel: '4_6',
    verifiedBadge: false,
    bio: 'Experienced electrician.',
    relevanceScore: null,
    businessName: null,
    ...overrides,
  };
}

function renderCard(profile: MarketplaceSearchResultItem) {
  return render(
    <MemoryRouter>
      <WorkerCard profile={profile} />
    </MemoryRouter>,
  );
}

describe('WorkerCard — Story 13-28 skills chips', () => {
  it('renders skills as canonical labels, not raw slugs (AC2/AC3)', () => {
    renderCard(makeProfile({ skills: ['electrical', 'solar'] }));

    const chips = screen.getByTestId('worker-card-skills');
    expect(chips).toHaveTextContent('Electrical Installation');
    expect(chips).toHaveTextContent('Solar Installation');
    // Exact-text guard: a raw-slug regression would render a node whose exact
    // text is the slug (the substring check can't catch that — 'Electrical
    // Installation' never contains lowercase 'electrical').
    expect(screen.queryByText('electrical')).not.toBeInTheDocument();
    expect(screen.queryByText('solar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-card-skills-more')).not.toBeInTheDocument();
  });

  it('caps at 3 chips and collapses the rest into "+N more" (AC2)', () => {
    renderCard(makeProfile({ skills: ['electrical', 'solar', 'plumbing', 'welding', 'tiling'] }));

    const chips = screen.getByTestId('worker-card-skills');
    // First 3 canonical labels shown...
    expect(chips).toHaveTextContent('Electrical Installation');
    expect(chips).toHaveTextContent('Solar Installation');
    expect(chips).toHaveTextContent('Plumbing');
    // ...the remaining 2 collapse.
    expect(screen.getByTestId('worker-card-skills-more')).toHaveTextContent('+2 more');
  });

  it('renders no skills section when the profile has no skills (AC2 graceful)', () => {
    renderCard(makeProfile({ skills: [] }));

    expect(screen.queryByTestId('worker-card-skills')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-card-skills-more')).not.toBeInTheDocument();
  });
});

describe('WorkerCard — Story 13-38 AC5 redesign', () => {
  it('leads with a trade-glyph avatar — never a name or a photo', () => {
    renderCard(makeProfile());

    expect(screen.getByTestId('trade-avatar')).toBeInTheDocument();
    // The locked decision: no photos on a public government marketplace.
    expect(document.querySelector('img')).toBeNull();
  });

  it('renders a real CTA, not a bare text link', () => {
    renderCard(makeProfile());

    expect(screen.getByTestId('worker-card-cta')).toHaveTextContent('View profile & contact');
  });

  it('shows the verification pill only when the profile is government verified', () => {
    renderCard(makeProfile({ verifiedBadge: true }));
    expect(screen.getByTestId('government-verified-badge')).toBeInTheDocument();
    // Honesty discipline R1 — the pill always says WHO verified, never a bare
    // "Verified" that would imply identity proofing we do not do.
    expect(screen.getByTestId('government-verified-badge')).toHaveTextContent('Government Verified');

    cleanup();
    renderCard(makeProfile({ verifiedBadge: false }));
    expect(screen.queryByTestId('government-verified-badge')).not.toBeInTheDocument();
  });

  it('renders NO association provenance line — that is Story 13-58, gated on 13-2', () => {
    renderCard(makeProfile({ verifiedBadge: true }));

    expect(screen.queryByText(/confirmed member/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Member-verified/i)).not.toBeInTheDocument();
  });

  it('keeps a SPARSE profile dignified — no empty blocks, no dangling labels', () => {
    renderCard(
      makeProfile({
        skills: ['welding'],
        bio: null,
        experienceLevel: null,
        lgaName: 'Akinyele',
        businessName: null,
        verifiedBadge: false,
      }),
    );

    // What must still carry the card:
    expect(screen.getByTestId('trade-avatar')).toBeInTheDocument();
    expect(screen.getByTestId('worker-card-identity')).toHaveTextContent('Electrician');
    expect(screen.getByText('Akinyele')).toBeInTheDocument();
    expect(screen.getByTestId('worker-card-cta')).toBeInTheDocument();
    // What must be absent rather than empty:
    expect(screen.queryByTestId('worker-card-experience-stat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-card-skills-more')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-card-profession-subline')).not.toBeInTheDocument();
    expect(screen.queryByText(/at this trade/i)).not.toBeInTheDocument();
  });
});

describe('WorkerCard — Story 13-38 AC7 experience as a stat', () => {
  it.each([
    ['4_6', '4–6', 'yrs'],
    ['1_3', '1–3', 'yrs'],
    ['less_1', 'Under 1', 'yr'],
    ['7_10', '7–10', 'yrs'],
  ])('renders bucket %s as the hero stat "%s %s"', (level, value, unit) => {
    renderCard(makeProfile({ experienceLevel: level }));

    const stat = screen.getByTestId('worker-card-experience-stat');
    expect(stat).toHaveTextContent(value);
    expect(stat).toHaveTextContent(unit);
    expect(stat).toHaveTextContent('at this trade');
    expect(screen.queryByTestId('worker-card-seasoned-marker')).not.toBeInTheDocument();
  });

  it('marks the TOP bucket as seasoned — the strongest claim the data supports', () => {
    renderCard(makeProfile({ experienceLevel: 'over_10' }));

    const stat = screen.getByTestId('worker-card-experience-stat');
    expect(stat).toHaveTextContent('Over 10');
    expect(stat).toHaveTextContent('seasoned');
    expect(screen.getByTestId('worker-card-seasoned-marker')).toBeInTheDocument();
  });

  it('never invents a precise number of years (the questionnaire has none)', () => {
    renderCard(makeProfile({ experienceLevel: 'over_10' }));

    // The mockup's sample card said "34 yrs"; no such value exists in the data.
    // The card must show the BOUND, and must not read as an exact count.
    const stat = screen.getByTestId('worker-card-experience-stat');
    expect(stat.textContent).toMatch(/Over 10/);
    expect(stat.textContent).not.toMatch(/^\s*\d+\s*yrs/);
  });

  it('renders legacy pre-13-38 stored buckets rather than dropping the stat', () => {
    // Rows the backfill has not reached still hold `4-7` / `15+`.
    renderCard(makeProfile({ experienceLevel: '4-7' }));
    expect(screen.getByTestId('worker-card-experience-stat')).toHaveTextContent('4–7');

    cleanup();
    renderCard(makeProfile({ experienceLevel: '15+' }));
    expect(screen.getByTestId('worker-card-seasoned-marker')).toBeInTheDocument();
  });

  it.each([
    ['null', null],
    ['an unrecognised value', 'somewhen'],
  ])('omits the stat block cleanly when experience is %s', (_case, level) => {
    renderCard(makeProfile({ experienceLevel: level }));

    expect(screen.queryByTestId('worker-card-experience-stat')).not.toBeInTheDocument();
    expect(screen.queryByText(/at this trade/i)).not.toBeInTheDocument();
  });
});

describe('WorkerCard — Story 13-38 AC8 business name', () => {
  it('leads with the business name and puts the profession beneath it', () => {
    renderCard(makeProfile({ businessName: 'Bola Motors & Sons', profession: 'Auto Mechanic' }));

    expect(screen.getByTestId('worker-card-identity')).toHaveTextContent('Bola Motors & Sons');
    expect(screen.getByTestId('worker-card-profession-subline')).toHaveTextContent('Auto Mechanic');
  });

  it('stays exactly profession-led when there is no business name (AC8.1)', () => {
    renderCard(makeProfile({ businessName: null, profession: 'Auto Mechanic' }));

    expect(screen.getByTestId('worker-card-identity')).toHaveTextContent('Auto Mechanic');
    // No empty slot, no dangling label.
    expect(screen.queryByTestId('worker-card-profession-subline')).not.toBeInTheDocument();
  });

  it('treats a whitespace-only business name as absent, not as an empty line', () => {
    renderCard(makeProfile({ businessName: '   ', profession: 'Auto Mechanic' }));

    expect(screen.getByTestId('worker-card-identity')).toHaveTextContent('Auto Mechanic');
    expect(screen.queryByTestId('worker-card-profession-subline')).not.toBeInTheDocument();
  });

  it('keeps a long signboard name on ONE line with the full text on hover (AC8.3)', () => {
    const long = 'Alhaji Fatai & Brothers Grand Central Aluminium Roofing And Fabrication Enterprises Ibadan';
    renderCard(makeProfile({ businessName: long }));

    const identity = screen.getByTestId('worker-card-identity');
    expect(identity).toHaveTextContent(long);
    // CSS truncation (not a JS slice) keeps grid density without losing the name;
    // the title attribute is how the full string stays reachable.
    expect(identity.className).toContain('truncate');
    expect(identity).toHaveAttribute('title', long);
  });

  it('NEVER shows a person name when the business name is absent (AC8.2)', () => {
    // The type carries no person-name field for this surface at all, which is the
    // structural guarantee; this asserts the rendered output alongside it.
    renderCard(makeProfile({ businessName: null, profession: 'Tailoring/Sewing' }));

    const card = screen.getByTestId('worker-card');
    expect(card.textContent).not.toMatch(/Adekemi|Ogunlade/);
    expect(screen.getByTestId('worker-card-identity')).toHaveTextContent('Tailoring/Sewing');
  });
});
