// @vitest-environment jsdom
/**
 * SupervisorMessagesPage Tests
 *
 * Story 2.5-4 AC3: Messages sidebar link target
 * Verifies empty state placeholder renders correctly.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);
import SupervisorMessagesPage from '../SupervisorMessagesPage';

afterEach(() => {
  cleanup();
});

describe('SupervisorMessagesPage', () => {
  it('renders page heading', () => {
    render(<SupervisorMessagesPage />);
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Communicate with your team')).toBeInTheDocument();
  });

  it('renders empty state message', () => {
    render(<SupervisorMessagesPage />);
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
    expect(screen.getByText('Team messaging will be available in a future update.')).toBeInTheDocument();
  });

  it('keeps messaging placeholder text visible', () => {
    render(<SupervisorMessagesPage />);
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });
});
