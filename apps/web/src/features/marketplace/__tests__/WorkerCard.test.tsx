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
    experienceLevel: '5-10 years',
    verifiedBadge: false,
    bio: 'Experienced electrician.',
    relevanceScore: null,
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
