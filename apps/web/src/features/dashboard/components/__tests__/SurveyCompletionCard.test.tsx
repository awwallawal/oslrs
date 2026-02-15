// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

expect.extend(matchers);

vi.mock('../../../../components/skeletons', () => ({
  SkeletonCard: ({ className }: { className?: string }) => <div aria-label="Loading card" className={className} />,
}));

import { SurveyCompletionCard } from '../SurveyCompletionCard';

describe('SurveyCompletionCard', () => {
  it('shows "Survey Completed" with green styling when total > 0', () => {
    render(<SurveyCompletionCard total={1} isLoading={false} error={null} />);
    expect(screen.getByTestId('survey-completion-card')).toBeInTheDocument();
    expect(screen.getByTestId('survey-completed')).toHaveTextContent('Survey Completed');
    expect(screen.getByText('Your skills survey has been submitted')).toBeInTheDocument();
  });

  it('shows "Not yet submitted" when total is 0', () => {
    render(<SurveyCompletionCard total={0} isLoading={false} error={null} />);
    expect(screen.getByTestId('survey-completion-card')).toBeInTheDocument();
    expect(screen.getByTestId('survey-pending')).toHaveTextContent('Not yet submitted');
    expect(screen.getByText('Complete your survey to join the marketplace')).toBeInTheDocument();
  });

  it('renders skeleton when loading', () => {
    render(<SurveyCompletionCard total={0} isLoading={true} error={null} />);
    expect(screen.queryByTestId('survey-completion-card')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loading card')).toBeInTheDocument();
  });

  it('returns null on error (graceful degradation)', () => {
    const { container } = render(
      <SurveyCompletionCard total={0} isLoading={false} error={new Error('fail')} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows completed even with multiple submissions', () => {
    render(<SurveyCompletionCard total={5} isLoading={false} error={null} />);
    expect(screen.getByTestId('survey-completed')).toBeInTheDocument();
  });

  it('accepts and applies className prop', () => {
    render(<SurveyCompletionCard total={1} isLoading={false} error={null} className="h-full lg:col-span-2" />);
    const card = screen.getByTestId('survey-completion-card');
    expect(card).toHaveClass('h-full');
  });

  it('applies className to skeleton during loading', () => {
    render(<SurveyCompletionCard total={0} isLoading={true} error={null} className="h-full lg:col-span-2" />);
    const skeleton = screen.getByLabelText('Loading card');
    expect(skeleton).toHaveClass('h-full');
  });
});
