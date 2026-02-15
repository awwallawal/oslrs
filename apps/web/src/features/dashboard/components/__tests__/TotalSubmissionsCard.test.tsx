// @vitest-environment jsdom
/**
 * TotalSubmissionsCard Tests
 * Story prep-2: renders total, loading, error, zero state
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { TotalSubmissionsCard } from '../TotalSubmissionsCard';

afterEach(() => {
  cleanup();
});

describe('TotalSubmissionsCard', () => {
  it('renders total as hero number', () => {
    render(<TotalSubmissionsCard total={42} label="Total Submissions" isLoading={false} error={null} />);
    expect(screen.getByTestId('total-submissions-card')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Total Submissions')).toBeInTheDocument();
    expect(screen.getByText('all time')).toBeInTheDocument();
  });

  it('renders zero state', () => {
    render(<TotalSubmissionsCard total={0} label="Total Submissions" isLoading={false} error={null} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders skeleton when loading', () => {
    render(<TotalSubmissionsCard total={0} label="Total Submissions" isLoading={true} error={null} />);
    expect(screen.queryByTestId('total-submissions-card')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loading card')).toBeInTheDocument();
  });

  it('renders nothing on error', () => {
    const { container } = render(
      <TotalSubmissionsCard total={0} label="Total Submissions" isLoading={false} error={new Error('fail')} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('accepts and applies className prop', () => {
    render(<TotalSubmissionsCard total={42} label="Test" isLoading={false} error={null} className="h-full lg:col-span-2" />);
    const card = screen.getByTestId('total-submissions-card');
    expect(card).toHaveClass('h-full');
  });

  it('applies className to skeleton during loading', () => {
    render(<TotalSubmissionsCard total={0} label="Test" isLoading={true} error={null} className="h-full lg:col-span-2" />);
    const skeleton = screen.getByLabelText('Loading card');
    expect(skeleton).toHaveClass('h-full');
  });
});
