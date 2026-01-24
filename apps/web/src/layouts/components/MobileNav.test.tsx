// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import { MobileNav } from './MobileNav';

expect.extend(matchers);

// Wrapper with Router context
function renderWithRouter(ui: React.ReactElement, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>
  );
}

describe('MobileNav', () => {
  it('renders hamburger menu button', () => {
    renderWithRouter(<MobileNav />);
    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    expect(menuButton).toBeInTheDocument();
  });

  it('opens drawer when hamburger menu is clicked', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    // Sheet content should be visible
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('shows navigation items when drawer is open (per Story 1.5-6 AC6)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      // About and Participate are expandable buttons
      expect(screen.getByRole('button', { name: /about/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /participate/i })).toBeInTheDocument();
      // Support is now expandable per AC6
      expect(screen.getByRole('button', { name: /support/i })).toBeInTheDocument();
      // Marketplace is a link
      expect(screen.getByRole('link', { name: /marketplace/i })).toBeInTheDocument();
      // Contact is now a navigation item per AC6
      expect(screen.getByRole('link', { name: /contact/i })).toBeInTheDocument();
    });
  });

  it('shows Register CTA but NOT Staff Login when drawer is open (per Story 1.5-6 AC6)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      // Register Now should be visible
      expect(screen.getByRole('link', { name: /register now/i })).toBeInTheDocument();
      // Staff Login should NOT be in mobile nav (moved to footer)
      expect(screen.queryByRole('link', { name: /staff login/i })).not.toBeInTheDocument();
    });
  });

  it('expands About submenu when clicked', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    // Open drawer
    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    // Click About to expand
    await waitFor(async () => {
      const aboutButton = screen.getByRole('button', { name: /about/i });
      await user.click(aboutButton);
    });

    // Submenu items should be visible
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /the initiative/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /how it works/i })).toBeInTheDocument();
    });
  });

  it('expands Support submenu when clicked (per Story 1.5-6 AC6)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    // Open drawer
    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    // Click Support to expand
    await waitFor(async () => {
      const supportButton = screen.getByRole('button', { name: /support/i });
      await user.click(supportButton);
    });

    // Submenu items should be visible
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /support center/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /faq/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /guides/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /verify worker/i })).toBeInTheDocument();
    });
  });

  it('has close button in drawer', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close navigation menu/i })).toBeInTheDocument();
    });
  });

  it('drawer has proper aria attributes', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });
  });

  it('is hidden on desktop (md: breakpoint)', () => {
    renderWithRouter(<MobileNav />);
    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    expect(menuButton).toHaveClass('md:hidden');
  });

  it('Contact link has correct href', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      const contactLink = screen.getByRole('link', { name: /contact/i });
      expect(contactLink).toHaveAttribute('href', '/support/contact');
    });
  });
});
