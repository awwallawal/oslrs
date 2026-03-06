// @vitest-environment jsdom
/**
 * NotFoundPage Tests
 *
 * Story prep-3 AC1: Invalid URLs under /dashboard/:role/* show "Page not found"
 * Story prep-3 AC2: Sidebar remains visible (renders within DashboardLayout Outlet)
 * Story prep-3 AC3: Shows heading, message, and "Back to Dashboard" button
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

expect.extend(matchers);
import { MemoryRouter } from 'react-router-dom';

import NotFoundPage from '../NotFoundPage';

// Mock useAuth to return a user with a specific role
const mockUser = { id: '1', email: 'test@test.com', fullName: 'Test User', role: 'super_admin', status: 'active' };

vi.mock('../../../auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

describe('NotFoundPage', () => {
  afterEach(() => {
    mockUser.role = 'super_admin';
  });

  it('renders "Page not found" heading', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });

  it('renders a friendly message', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/doesn't exist or has been moved/i)).toBeInTheDocument();
  });

  it('renders "Back to Dashboard" link navigating to role-based path', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /back to dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard/super-admin');
  });

  it('uses correct dashboard path for data_entry_clerk role', () => {
    mockUser.role = 'data_entry_clerk';
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /back to dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard/clerk');
  });

  it('falls back to /dashboard when no user', () => {
    mockUser.role = '' as never;
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /back to dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });
});
