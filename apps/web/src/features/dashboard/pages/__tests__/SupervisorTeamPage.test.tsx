// @vitest-environment jsdom
/**
 * SupervisorTeamPage Tests
 *
 * Story 2.5-4 AC2: Team Overview Detail
 * Verifies empty state placeholder renders correctly.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);
import SupervisorTeamPage from '../SupervisorTeamPage';

afterEach(() => {
  cleanup();
});

describe('SupervisorTeamPage', () => {
  it('renders page heading', () => {
    render(<SupervisorTeamPage />);
    expect(screen.getByText('Team Progress')).toBeInTheDocument();
    expect(screen.getByText('Monitor your assigned enumerators')).toBeInTheDocument();
  });

  it('renders empty state message', () => {
    render(<SupervisorTeamPage />);
    expect(screen.getByText('No enumerators assigned yet')).toBeInTheDocument();
    expect(screen.getByText('Team assignments will be available in a future update.')).toBeInTheDocument();
  });

  it('renders Users icon', () => {
    render(<SupervisorTeamPage />);
    expect(document.querySelector('.lucide-users')).toBeInTheDocument();
  });
});
