// @vitest-environment jsdom
/**
 * Story 13-59 (AC5, AC6, AC7.4, AC8.3) — the modal and the panel.
 *
 * ## AC8.3 in one line
 *
 * *"RED-verify the modal: an enumerator who has never downloaded sees it; one
 * who has, does not."* Both halves are asserted below, because only the pair
 * distinguishes a working prompt from one that is either always on (wallpaper,
 * which people learn to dismiss) or always off (the offer that was never made).
 *
 * ## Why the download button is not the assertion
 *
 * AC7.1: *a closeable modal that everyone dismisses has delivered nothing.*
 * What matters is that the modal's visibility tracks the SERVER's
 * `promptRequired`, and that a person who cannot be served a card is told why
 * and given the way out (AC5.3) rather than a button that 400s.
 */
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

expect.extend(matchers);

const { mockFetchArtefactState, mockDownloadArtefact } = vi.hoisted(() => ({
  mockFetchArtefactState: vi.fn(),
  mockDownloadArtefact: vi.fn(),
}));

vi.mock('../../api/artefacts.api', () => ({
  fetchArtefactState: mockFetchArtefactState,
  downloadArtefact: mockDownloadArtefact,
}));
vi.mock('../../../auth/context/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

import { StaffArtefactsModal } from '../StaffArtefactsModal';
import { StaffArtefactsPanel } from '../StaffArtefactsPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const artefact = (overrides: Record<string, unknown> = {}) => ({
  applicable: true,
  available: true,
  unavailableReason: null,
  downloadedAt: null,
  ...overrides,
});

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

/**
 * ⚠️ WAIT FOR THE DATA, NOT FOR THE FETCH TO BE CALLED.
 *
 * The first draft of this file asserted absence after
 * `waitFor(() => expect(fetchArtefactState).toHaveBeenCalled())`. That resolves
 * the moment the query STARTS, so the component had not re-rendered with data
 * yet and the modal was absent for a reason that had nothing to do with the
 * behaviour under test.
 *
 * It was caught by RED-verifying: neutering the `promptRequired` gate so the
 * modal opened unconditionally left all eight tests GREEN. **An absence
 * consistent with both a working gate and a deleted one proves neither** (§2aa)
 * — and "the element is not there" is the single easiest assertion to satisfy
 * by accident, because it is also what a component that has not rendered looks
 * like.
 */
async function artefactsLoaded(queryClient: QueryClient) {
  await waitFor(() =>
    expect(queryClient.getQueryState(['users', 'artefacts'])?.status).toBe('success'),
  );
}

describe('AC8.3 — the modal appears for the person who has not taken theirs', () => {
  it('SHOWS for an enumerator who has downloaded nothing', async () => {
    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact(),
      briefing: artefact(),
      promptRequired: true,
    });

    renderWithProviders(<StaffArtefactsModal />);

    expect(await screen.findByText(/Take these with you before you go/i)).toBeInTheDocument();
  });

  /**
   * The other half of AC8.3, and the one that keeps the prompt from becoming
   * wallpaper. A modal that showed unconditionally would pass the test above.
   */
  it('does NOT show once both artefacts have been taken', async () => {
    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact({ downloadedAt: '2026-08-15T10:00:00.000Z' }),
      briefing: artefact({ downloadedAt: '2026-08-15T10:01:00.000Z' }),
      promptRequired: false,
    });

    const { queryClient } = renderWithProviders(<StaffArtefactsModal />);

    await artefactsLoaded(queryClient);
    expect(screen.queryByText(/Take these with you before you go/i)).not.toBeInTheDocument();
  });

  it('does NOT show for a back-office role, who is entitled to neither', async () => {
    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact({ applicable: false, available: false }),
      briefing: artefact({ applicable: false, available: false }),
      promptRequired: false,
    });

    const { queryClient } = renderWithProviders(<StaffArtefactsModal />);

    await artefactsLoaded(queryClient);
    expect(screen.queryByText(/Take these with you before you go/i)).not.toBeInTheDocument();
  });

  /**
   * ⭐ Review M3 — THE HALF THAT WAS MISSING.
   *
   * AC7.4 is "the modal RE-APPEARS while either artefact is undownloaded —
   * closeable every time, persistent until satisfied", and the story calls it
   * *"the load-bearing half of the decision"*: without it the 2026-08-10 ruling
   * traded guaranteed inbox delivery for an optional dialog. Every test in this
   * file proved the modal opens and that it closes. **Nothing proved it comes
   * back**, which is the only property that separates a delivery from an offer.
   *
   * Dismissal is `useState`, so a fresh mount is a fresh session — the prompt
   * returns. A future refactor that "helpfully" persists the dismissal to
   * localStorage would ship the offer, and this is the test that would catch it.
   */
  it('COMES BACK on the next session while an artefact is still outstanding', async () => {
    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact(),
      briefing: artefact(),
      promptRequired: true,
    });

    const first = renderWithProviders(<StaffArtefactsModal />);
    await screen.findByText(/Take these with you before you go/i);
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    await waitFor(() =>
      expect(screen.queryByText(/Take these with you before you go/i)).not.toBeInTheDocument(),
    );

    // A new session: the layout remounts, and nothing has been downloaded.
    first.unmount();
    renderWithProviders(<StaffArtefactsModal />);

    expect(await screen.findByText(/Take these with you before you go/i)).toBeInTheDocument();
  });

  /**
   * The other side of the same rule — persistence must END. A prompt that
   * returns after the person has complied is wallpaper, and wallpaper is what
   * teaches them to dismiss the one that matters.
   */
  it('does NOT come back once the artefacts have been taken', async () => {
    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact(),
      briefing: artefact(),
      promptRequired: true,
    });

    const first = renderWithProviders(<StaffArtefactsModal />);
    await screen.findByText(/Take these with you before you go/i);
    first.unmount();

    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact({ downloadedAt: '2026-08-16T09:00:00.000Z' }),
      briefing: artefact({ downloadedAt: '2026-08-16T09:01:00.000Z' }),
      promptRequired: false,
    });

    const { queryClient } = renderWithProviders(<StaffArtefactsModal />);
    await artefactsLoaded(queryClient);
    expect(screen.queryByText(/Take these with you before you go/i)).not.toBeInTheDocument();
  });

  /** Review L3 — AC5.2 says nobody is trapped. Escape is an exit too. */
  it('closes on Escape, not only on the button', async () => {
    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact(),
      briefing: artefact(),
      promptRequired: true,
    });

    renderWithProviders(<StaffArtefactsModal />);
    const heading = await screen.findByText(/Take these with you before you go/i);

    fireEvent.keyDown(heading, { key: 'Escape', code: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByText(/Take these with you before you go/i)).not.toBeInTheDocument(),
    );
  });

  /** AC5.2 — closeable. Nobody is trapped in a dialog. */
  it('closes when "Not now" is pressed', async () => {
    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact(),
      briefing: artefact(),
      promptRequired: true,
    });

    renderWithProviders(<StaffArtefactsModal />);
    const heading = await screen.findByText(/Take these with you before you go/i);
    expect(heading).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /not now/i }));

    await waitFor(() =>
      expect(screen.queryByText(/Take these with you before you go/i)).not.toBeInTheDocument(),
    );
  });
});

describe('AC5.3 — a card with no photo is withheld, not broken', () => {
  it('explains the missing photo and links the retry instead of offering a download', async () => {
    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact({ available: false, unavailableReason: 'photo_missing' }),
      briefing: artefact(),
      promptRequired: true,
    });

    renderWithProviders(<StaffArtefactsPanel />);

    expect(await screen.findByText(/no photo yet/i)).toBeInTheDocument();
    // 13-60's way back, reused rather than reinvented.
    expect(screen.getByRole('link', { name: /add your photo/i })).toHaveAttribute(
      'href',
      '/profile-completion',
    );
    // Exactly one download button — the briefing's. Offering a card download
    // that the endpoint refuses is the "test that passes over a hole" shape.
    expect(screen.getAllByRole('button', { name: /^download$/i })).toHaveLength(1);
  });
});

describe('AC6 — the panel is the one implementation', () => {
  it('shows what has already been taken, so a re-download is an informed choice', async () => {
    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact({ downloadedAt: '2026-08-15T10:00:00.000Z' }),
      briefing: artefact(),
      promptRequired: true,
    });

    renderWithProviders(<StaffArtefactsPanel />);

    expect(await screen.findByText(/Downloaded 15 Aug 2026/i)).toBeInTheDocument();
    // AC6.4 — still reachable afterwards. A lost phone must be self-serve.
    expect(screen.getByRole('button', { name: /download again/i })).toBeInTheDocument();
  });

  it('hides an artefact the role is not entitled to', async () => {
    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact(),
      briefing: artefact({ applicable: false, available: false }),
      promptRequired: true,
    });

    renderWithProviders(<StaffArtefactsPanel />);

    expect(await screen.findByText(/Staff ID card/i)).toBeInTheDocument();
    expect(screen.queryByText(/Enumerator field briefing/i)).not.toBeInTheDocument();
  });

  /**
   * Review M1 — a heading is part of the thing it names.
   *
   * ProfilePage used to render "My ID & Field Briefing" itself and drop this
   * panel underneath. The panel returns null for anyone entitled to neither
   * artefact — every back-office role, and every citizen on the same shared
   * page — so those people were shown a heading and an instruction to save
   * files that do not exist for them. The heading now comes in as a prop and
   * leaves with the content.
   */
  it('takes its heading with it when the person is entitled to nothing', async () => {
    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact({ applicable: false, available: false }),
      briefing: artefact({ applicable: false, available: false }),
      promptRequired: false,
    });

    const { queryClient } = renderWithProviders(
      <StaffArtefactsPanel heading={<h2>My ID &amp; Field Briefing</h2>} />,
    );

    await artefactsLoaded(queryClient);
    expect(screen.queryByText(/My ID & Field Briefing/i)).not.toBeInTheDocument();
  });

  it('shows the heading for someone who IS entitled', async () => {
    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact(),
      briefing: artefact(),
      promptRequired: true,
    });

    renderWithProviders(<StaffArtefactsPanel heading={<h2>My ID &amp; Field Briefing</h2>} />);

    expect(await screen.findByText(/My ID & Field Briefing/i)).toBeInTheDocument();
  });

  it('a failed download surfaces the SERVER message, not a generic failure', async () => {
    mockFetchArtefactState.mockResolvedValue({
      idCard: artefact(),
      briefing: artefact({ applicable: false }),
      promptRequired: true,
    });
    mockDownloadArtefact.mockRejectedValue(new Error('No ID card can be produced yet'));

    renderWithProviders(<StaffArtefactsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /^download$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/No ID card can be produced yet/i);
  });
});
