// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { AuthLayout } from './AuthLayout';

expect.extend(matchers);

// Test child component to verify Outlet renders
function TestChild() {
  return <div data-testid="test-child">Auth Form Content</div>;
}

// Wrapper with Router context and Outlet
function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={ui}>
          <Route index element={<TestChild />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('AuthLayout', () => {
  it('renders Back to Homepage link', () => {
    renderWithRouter(<AuthLayout />);
    const backLink = screen.getByRole('link', { name: /back to homepage/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/');
  });

  it('renders logo with correct dimensions (60px)', () => {
    renderWithRouter(<AuthLayout />);
    const logo = screen.getByAltText(/oyo state labour/i);
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveClass('h-[60px]');
  });

  it('renders logo link to homepage', () => {
    renderWithRouter(<AuthLayout />);
    const logoLink = screen.getByRole('link', { name: /oslsr home/i });
    expect(logoLink).toBeInTheDocument();
    expect(logoLink).toHaveAttribute('href', '/');
  });

  it('renders children via Outlet', () => {
    renderWithRouter(<AuthLayout />);
    expect(screen.getByTestId('test-child')).toBeInTheDocument();
    expect(screen.getByText('Auth Form Content')).toBeInTheDocument();
  });

  it('has neutral-50 background', () => {
    renderWithRouter(<AuthLayout />);
    const container = document.querySelector('[class*="bg-neutral-50"]');
    expect(container).toBeInTheDocument();
  });

  it('does not render header navigation', () => {
    renderWithRouter(<AuthLayout />);
    // Should NOT have navigation menu items that PublicLayout has
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    // These would exist in PublicLayout header but not in AuthLayout
    expect(screen.queryByRole('button', { name: /about/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /participate/i })).not.toBeInTheDocument();
  });

  it('does not render footer', () => {
    renderWithRouter(<AuthLayout />);
    // Should NOT have footer
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('centers content horizontally and vertically', () => {
    renderWithRouter(<AuthLayout />);
    const flexContainer = document.querySelector('[class*="flex-1"][class*="flex"][class*="items-center"][class*="justify-center"]');
    expect(flexContainer).toBeInTheDocument();
  });

  it('wraps content in auth card', () => {
    renderWithRouter(<AuthLayout />);
    const card = document.querySelector('[class*="bg-white"][class*="rounded-xl"]');
    expect(card).toBeInTheDocument();
  });

  it('has accessible focus states on links', () => {
    renderWithRouter(<AuthLayout />);
    const backLink = screen.getByRole('link', { name: /back to homepage/i });
    expect(backLink.className).toContain('focus:outline-none');
    expect(backLink.className).toContain('focus:ring-2');
  });
});
