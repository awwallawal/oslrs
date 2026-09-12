// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { AssociationConfirmedBadge } from '../components/AssociationConfirmedBadge';

expect.extend(matchers);

afterEach(() => cleanup());

/**
 * Story 13-58 — the tier-1 provenance badge.
 *
 * R1 IS LOCKED: this badge must NEVER read as a bare "Verified". There is no
 * NIMC path anywhere in this system, and for an association import the NIN was
 * proxy-transcribed by the association head. Naming the accountable body is both
 * the honest claim and the stronger one — an employer can chase AFAN; they cannot
 * chase a checkmark.
 */
describe('AssociationConfirmedBadge', () => {
  it('names the accountable body (AC1)', () => {
    render(<AssociationConfirmedBadge associationName="AFAN" interactive={false} />);

    expect(screen.getByTestId('association-confirmed-badge')).toHaveTextContent(
      'AFAN — confirmed member',
    );
  });

  it('renders whatever body vouched, not a hardcoded one', () => {
    render(<AssociationConfirmedBadge associationName="ASNAT" interactive={false} />);

    expect(screen.getByTestId('association-confirmed-badge')).toHaveTextContent(
      'ASNAT — confirmed member',
    );
  });

  /**
   * R1. Asserted as an exact-word check rather than a substring one, because
   * "confirmed member" contains no "Verified" and a lazy substring test would pass
   * over the very regression it exists to catch.
   */
  it('never emits a bare "Verified" claim (R1 LOCKED)', () => {
    render(<AssociationConfirmedBadge associationName="AFAN" interactive={false} />);

    const badge = screen.getByTestId('association-confirmed-badge');
    expect(badge.textContent).not.toMatch(/\bverified\b/i);
  });

  it('carries the AC3 disclosure on the static pill', () => {
    render(<AssociationConfirmedBadge associationName="AFAN" interactive={false} />);

    const badge = screen.getByTestId('association-confirmed-badge');
    expect(badge).toHaveAttribute(
      'aria-label',
      'Confirmed as a member by AFAN. Identity not independently verified.',
    );
    expect(badge).toHaveAttribute(
      'title',
      'Confirmed as a member by AFAN. Identity not independently verified.',
    );
  });

  /**
   * [AI-Review][Medium] 2026-09-08 — the disclosure must be ANNOUNCED, not merely
   * present as an attribute. On a bare <span> (role=generic) ARIA forbids an
   * accessible name, so `aria-label` is ignored by assistive tech and `title` is a
   * mouse-only tooltip: a screen-reader user on the browse grid got
   * "AFAN — confirmed member" and none of the "identity not independently verified"
   * half. Asserting the attribute alone is a test that passes over that hole, so
   * this asserts the ROLE that makes the attribute mean anything — and does it via
   * the accessible-name query, which is what AT actually resolves.
   */
  it('announces the disclosure to assistive tech, not just on hover (AC3)', () => {
    render(<AssociationConfirmedBadge associationName="AFAN" interactive={false} />);

    expect(screen.getByTestId('association-confirmed-badge')).toHaveAttribute('role', 'img');
    expect(
      screen.getByRole('img', {
        name: 'Confirmed as a member by AFAN. Identity not independently verified.',
      }),
    ).toBeInTheDocument();
  });

  it('states what the badge does NOT mean when expanded (AC3)', () => {
    render(<AssociationConfirmedBadge associationName="AFAN" />);

    fireEvent.click(screen.getByRole('button'));

    const panel = screen.getByTestId('association-confirmation-info');
    expect(panel).toHaveTextContent('AFAN');
    expect(panel.textContent).toMatch(/not.*confirmed this identity with NIMC/i);
  });

  /**
   * AC5 — the association badge must not be mistakable for the government one at
   * grid density. Shape carries the distinction as well as colour (a different
   * icon, different words), so the two remain separable for a colour-blind reader.
   */
  it('does not reuse the government badge palette (AC5)', () => {
    render(<AssociationConfirmedBadge associationName="AFAN" interactive={false} />);

    const badge = screen.getByTestId('association-confirmed-badge');
    expect(badge.className).not.toMatch(/green/);
  });
});
