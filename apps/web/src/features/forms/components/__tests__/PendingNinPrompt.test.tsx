// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PendingNinPrompt } from '../PendingNinPrompt';

expect.extend(matchers);

describe('PendingNinPrompt (Story 9-12 Task 13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open=false', () => {
    const { container } = render(
      <PendingNinPrompt open={false} onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the prompt with reason textarea + confirm + cancel when open', () => {
    render(<PendingNinPrompt open onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('pending-nin-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('pending-nin-prompt-reason')).toBeInTheDocument();
    expect(screen.getByTestId('pending-nin-prompt-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('pending-nin-prompt-cancel')).toBeInTheDocument();
  });

  it('confirms with no reason when textarea is empty', async () => {
    const onConfirm = vi.fn();
    render(<PendingNinPrompt open onConfirm={onConfirm} onCancel={() => {}} />);
    await userEvent.click(screen.getByTestId('pending-nin-prompt-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('confirms with the trimmed reason when textarea has content', async () => {
    const onConfirm = vi.fn();
    render(<PendingNinPrompt open onConfirm={onConfirm} onCancel={() => {}} />);
    const reason = screen.getByTestId('pending-nin-prompt-reason') as HTMLTextAreaElement;
    await userEvent.type(reason, '  respondent forgot card  ');
    await userEvent.click(screen.getByTestId('pending-nin-prompt-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('respondent forgot card');
  });

  it('treats whitespace-only reason as empty (passes undefined)', async () => {
    const onConfirm = vi.fn();
    render(<PendingNinPrompt open onConfirm={onConfirm} onCancel={() => {}} />);
    const reason = screen.getByTestId('pending-nin-prompt-reason') as HTMLTextAreaElement;
    await userEvent.type(reason, '   ');
    await userEvent.click(screen.getByTestId('pending-nin-prompt-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('cancels without firing onConfirm', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<PendingNinPrompt open onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByTestId('pending-nin-prompt-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('caps reason input at 500 characters via maxLength', () => {
    render(<PendingNinPrompt open onConfirm={() => {}} onCancel={() => {}} />);
    const reason = screen.getByTestId('pending-nin-prompt-reason') as HTMLTextAreaElement;
    expect(reason.maxLength).toBe(500);
  });
});
