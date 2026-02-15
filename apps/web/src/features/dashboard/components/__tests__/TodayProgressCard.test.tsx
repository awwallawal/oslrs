// @vitest-environment jsdom
/**
 * TodayProgressCard Tests
 * Story prep-2: renders count/target, progress bar color, loading, error
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { TodayProgressCard } from '../TodayProgressCard';

afterEach(() => {
  cleanup();
});

describe('TodayProgressCard', () => {
  it('renders count and target', () => {
    render(<TodayProgressCard todayCount={15} target={25} label="surveys today" isLoading={false} error={null} />);
    expect(screen.getByTestId('today-progress-card')).toBeInTheDocument();
    expect(screen.getByTestId('today-count')).toHaveTextContent('15');
    expect(screen.getByText(/\/ 25 surveys today/)).toBeInTheDocument();
  });

  it('progress bar uses maroon when below target', () => {
    render(<TodayProgressCard todayCount={10} target={25} label="surveys today" isLoading={false} error={null} />);
    const bar = screen.getByTestId('progress-bar');
    expect(bar).toHaveClass('bg-[#9C1E23]');
    expect(bar).not.toHaveClass('bg-emerald-500');
  });

  it('progress bar uses emerald when target met', () => {
    render(<TodayProgressCard todayCount={25} target={25} label="surveys today" isLoading={false} error={null} />);
    const bar = screen.getByTestId('progress-bar');
    expect(bar).toHaveClass('bg-emerald-500');
  });

  it('progress bar uses emerald when target exceeded', () => {
    render(<TodayProgressCard todayCount={30} target={25} label="surveys today" isLoading={false} error={null} />);
    const bar = screen.getByTestId('progress-bar');
    expect(bar).toHaveClass('bg-emerald-500');
  });

  it('renders skeleton when loading', () => {
    render(<TodayProgressCard todayCount={0} target={25} label="surveys today" isLoading={true} error={null} />);
    expect(screen.queryByTestId('today-progress-card')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loading card')).toBeInTheDocument();
  });

  it('renders nothing on error', () => {
    const { container } = render(
      <TodayProgressCard todayCount={0} target={25} label="surveys today" isLoading={false} error={new Error('fail')} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('accepts and applies className prop', () => {
    render(<TodayProgressCard todayCount={15} target={25} label="surveys today" isLoading={false} error={null} className="h-full lg:col-span-2" />);
    const card = screen.getByTestId('today-progress-card');
    expect(card).toHaveClass('h-full');
  });

  it('applies className to skeleton during loading', () => {
    render(<TodayProgressCard todayCount={0} target={25} label="surveys today" isLoading={true} error={null} className="h-full lg:col-span-2" />);
    const skeleton = screen.getByLabelText('Loading card');
    expect(skeleton).toHaveClass('h-full');
  });
});
