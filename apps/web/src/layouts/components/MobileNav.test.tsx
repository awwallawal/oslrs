// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
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

  it('shows navigation items when drawer is open', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /about/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /participate/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /support/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /marketplace/i })).toBeInTheDocument();
    });
  });

  it('shows CTAs when drawer is open', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileNav />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /register now/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /staff login/i })).toBeInTheDocument();
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
});
