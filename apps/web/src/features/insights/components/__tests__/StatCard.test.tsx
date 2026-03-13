// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Users } from 'lucide-react';
import { StatCard } from '../StatCard';

expect.extend(matchers);
afterEach(() => cleanup());

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard icon={Users} label="Total Users" value={500} />);
    expect(screen.getByText('Total Users')).toBeInTheDocument();
    // AnimatedCounter uses aria-label for the final value
    expect(screen.getByLabelText('500')).toBeInTheDocument();
  });

  it('renders optional subtitle', () => {
    render(<StatCard icon={Users} label="GPI" value={85} suffix="%" subtitle="Gender Parity Index: 0.85" />);
    expect(screen.getByText('Gender Parity Index: 0.85')).toBeInTheDocument();
  });

  it('renders N/A when value is null', () => {
    render(<StatCard icon={Users} label="GPI" value={null} />);
    expect(screen.getByLabelText('Not available')).toBeInTheDocument();
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});
