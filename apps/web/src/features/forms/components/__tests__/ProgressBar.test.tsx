import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { ProgressBar } from '../ProgressBar';

afterEach(() => {
  cleanup();
});

const sections = [
  { id: 's1', title: 'Consent' },
  { id: 's2', title: 'Demographics' },
  { id: 's3', title: 'Skills' },
];

describe('ProgressBar', () => {
  it('renders progress bar with correct question count', () => {
    render(
      <ProgressBar
        currentIndex={2}
        totalVisible={10}
        sections={sections}
        currentSectionId="s1"
      />
    );
    expect(screen.getByText(/Question 3 of 10/)).toBeInTheDocument();
  });

  it('displays section count', () => {
    render(
      <ProgressBar
        currentIndex={0}
        totalVisible={5}
        sections={sections}
        currentSectionId="s2"
      />
    );
    expect(screen.getByText(/Section 2 of 3/)).toBeInTheDocument();
  });

  it('renders section dots', () => {
    render(
      <ProgressBar
        currentIndex={0}
        totalVisible={5}
        sections={sections}
        currentSectionId="s1"
      />
    );
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
  });

  it('shows correct fill percentage', () => {
    const { container } = render(
      <ProgressBar
        currentIndex={4}
        totalVisible={10}
        sections={sections}
        currentSectionId="s2"
      />
    );
    const fillBar = container.querySelector('[role="progressbar"]');
    expect(fillBar).toHaveStyle({ width: '50%' });
  });
});
