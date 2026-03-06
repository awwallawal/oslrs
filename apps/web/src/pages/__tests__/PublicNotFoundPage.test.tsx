// @vitest-environment jsdom
/**
 * PublicNotFoundPage Tests
 *
 * Story prep-3 AC4: Invalid URLs outside /dashboard show public 404 page
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import PublicNotFoundPage from '../PublicNotFoundPage';

describe('PublicNotFoundPage', () => {
  it('renders "Page not found" heading', () => {
    render(
      <MemoryRouter>
        <PublicNotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });

  it('renders a friendly message', () => {
    render(
      <MemoryRouter>
        <PublicNotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/doesn't exist or has been moved/i)).toBeInTheDocument();
  });

  it('renders "Go to Homepage" link pointing to /', () => {
    render(
      <MemoryRouter>
        <PublicNotFoundPage />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /go to homepage/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });
});
