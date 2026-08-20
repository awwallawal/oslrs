// @vitest-environment jsdom
/**
 * Story 12-5 AC6.3 — the N denominator renders in the shared chart header, and
 * a card that omits it renders exactly as before (the prop is additive).
 */
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);
afterEach(() => cleanup());

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive">{children}</div>,
}));

import { ChartCard } from '../ChartCard';

describe('ChartCard', () => {
  it('renders the N denominator the chart was counted over', () => {
    render(
      <ChartCard title="Gender Distribution" n={76}>
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.getByTestId('chart-n')).toHaveTextContent('N = 76');
  });

  it('formats large denominators with thousands separators', () => {
    render(
      <ChartCard title="LGA Distribution" n={1247}>
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.getByTestId('chart-n')).toHaveTextContent('N = 1,247');
  });

  it('renders no N at all when the prop is omitted (additive, no regression)', () => {
    render(
      <ChartCard title="Registration Trends">
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.queryByTestId('chart-n')).not.toBeInTheDocument();
    expect(screen.getByText('Registration Trends')).toBeInTheDocument();
  });

  it('renders N = 0 rather than hiding it, so an empty chart says so', () => {
    // 0 is a real denominator and must not be swallowed by a falsy check —
    // a chart over nobody should say it is over nobody.
    render(
      <ChartCard title="Marital Status" n={0}>
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.getByTestId('chart-n')).toHaveTextContent('N = 0');
  });

  it('renders an optional plain-language subtitle alongside the N', () => {
    render(
      <ChartCard title="Employment Type" n={64} subtitle="counted over 64 respondents who answered">
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.getByTestId('chart-n')).toHaveTextContent('N = 64');
    expect(screen.getByText('counted over 64 respondents who answered')).toBeInTheDocument();
  });

  it('carries the plain-language reading of N as the tooltip (AC5)', () => {
    // The explainer used to exist as an exported helper that nothing rendered.
    // Riding along as `title` keeps the header terse and keeps the wording in
    // one shared string instead of a second line on twenty cards.
    render(
      <ChartCard title="Age Distribution" n={70}>
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.getByTestId('chart-n'))
      .toHaveAttribute('title', 'counted over 70 respondents who answered');
  });

  it('wraps children in a ResponsiveContainer only when asked', () => {
    const { rerender } = render(
      <ChartCard title="A"><div>bare</div></ChartCard>,
    );
    expect(screen.queryByTestId('responsive')).not.toBeInTheDocument();

    rerender(<ChartCard title="A" responsive><div>wrapped</div></ChartCard>);
    expect(screen.getByTestId('responsive')).toBeInTheDocument();
  });

  it('renders header actions when provided', () => {
    render(
      <ChartCard title="Top Skills" actions={<button>Toggle</button>}>
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.getByRole('button', { name: 'Toggle' })).toBeInTheDocument();
  });
});
