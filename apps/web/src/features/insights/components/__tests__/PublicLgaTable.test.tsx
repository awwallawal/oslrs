// @vitest-environment jsdom
/**
 * PublicLgaTable Tests
 * Story 13-33 (review M1): banded LGAs (present but below the k-anon floor) must
 * appear in the table as "Fewer than 10" — so the table agrees with the map,
 * which shades them "present". Non-banded suppressed buckets stay hidden.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FrequencyBucket } from '@oslsr/types';
import { PublicLgaTable } from '../PublicLgaTable';

expect.extend(matchers);

describe('PublicLgaTable (Story 13-33 AC3 / review M1)', () => {
  it('renders exact LGAs with their count and share', () => {
    const density: FrequencyBucket[] = [
      { label: 'Ibadan North', count: 16, percentage: 40, banded: false },
    ];
    render(<PublicLgaTable lgaDensity={density} />);
    expect(screen.getByText('Ibadan North')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
  });

  it('renders banded LGAs as "Fewer than 10" with a dash share — not dropped', () => {
    const density: FrequencyBucket[] = [
      { label: 'Ibadan North', count: 16, percentage: 40, banded: false },
      { label: 'Lagelu', count: null, percentage: null, suppressed: true, banded: true },
    ];
    render(<PublicLgaTable lgaDensity={density} />);
    // Banded LGA is present in the table (agrees with the map)...
    expect(screen.getByText('Lagelu')).toBeInTheDocument();
    expect(screen.getByText('Fewer than 10')).toBeInTheDocument();
    // ...and its exact sub-floor count is never rendered.
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('still hides legacy suppressed-but-not-banded buckets', () => {
    const density: FrequencyBucket[] = [
      { label: 'Ibadan North', count: 16, percentage: 40, banded: false },
      { label: 'Old', count: null, percentage: null, suppressed: true },
    ];
    render(<PublicLgaTable lgaDensity={density} />);
    expect(screen.getByText('Ibadan North')).toBeInTheDocument();
    expect(screen.queryByText('Old')).not.toBeInTheDocument();
  });
});
