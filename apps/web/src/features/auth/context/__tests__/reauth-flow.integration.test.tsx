// @vitest-environment jsdom
/**
 * Story 13-17 — integration test for the global step-up re-auth flow.
 *
 * Exercises the REAL wiring end-to-end at the React layer:
 *   reauth-gate.requestReAuth()  (what api-client calls on 403 AUTH_REAUTH_REQUIRED)
 *     → AuthContext listener dispatches REQUIRE_REAUTH
 *     → globally-rendered ReAuthModal opens (useReAuth auto-open)
 *     → submit password → authApi.reAuthenticate → gate resolves true
 *     → OR cancel → gate resolves false, modal closes.
 *
 * The api-client side of the contract (403 detect → requestReAuth → replay)
 * is covered in lib/__tests__/api-client.test.ts.
 */
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AuthProvider } from '../AuthContext';
import { ReAuthModal } from '../../components/ReAuthModal';
import * as authApi from '../../api/auth.api';
import { __resetAuthTokenHolder } from '../../../../lib/auth-token-holder';
import { requestReAuth, __resetReAuthGate } from '../../../../lib/reauth-gate';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});

// Mock sync manager + offline-db (same shape as AuthContext.test.tsx)
const mockSyncManager = vi.hoisted(() => ({
  setUserId: vi.fn(),
  init: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('../../../../services/sync-manager', () => ({
  syncManager: mockSyncManager,
}));

const mockDbDraftsWhere = vi.hoisted(() => vi.fn());
const mockDbQueueWhere = vi.hoisted(() => vi.fn());
vi.mock('../../../../lib/offline-db', () => ({
  db: {
    drafts: { where: mockDbDraftsWhere, update: vi.fn() },
    submissionQueue: { where: mockDbQueueWhere, update: vi.fn() },
  },
}));

vi.mock('../../api/auth.api', () => ({
  staffLogin: vi.fn(),
  publicLogin: vi.fn(),
  logout: vi.fn(),
  refreshToken: vi.fn(),
  getCurrentUser: vi.fn(),
  reAuthenticate: vi.fn(),
  AuthApiError: class AuthApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

const mockAuthApi = authApi as unknown as {
  refreshToken: ReturnType<typeof vi.fn>;
  getCurrentUser: ReturnType<typeof vi.fn>;
  reAuthenticate: ReturnType<typeof vi.fn>;
};

function renderProviderWithModal() {
  return render(
    <AuthProvider>
      {/* Mirrors App.tsx:253 — the globally-rendered modal */}
      <ReAuthModal />
    </AuthProvider>,
  );
}

async function waitForRestoredSession() {
  await waitFor(() => {
    expect(mockAuthApi.getCurrentUser).toHaveBeenCalled();
  });
}

describe('Story 13-17 — gate → AuthContext → ReAuthModal integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetAuthTokenHolder();
    __resetReAuthGate();
    sessionStorage.clear();
    mockDbDraftsWhere.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
    mockDbQueueWhere.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    });
    // Restore an authenticated session (reAuthenticate needs state.accessToken).
    mockAuthApi.refreshToken.mockResolvedValue({ accessToken: 'tok', expiresIn: 900 });
    mockAuthApi.getCurrentUser.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      fullName: 'Admin',
      role: 'super_admin',
      status: 'active',
      rememberMe: true,
    });
  });

  it('requestReAuth opens the modal; successful password submit resolves the gate true and closes it (AC1+AC2)', async () => {
    mockAuthApi.reAuthenticate.mockResolvedValue({ verified: true });
    renderProviderWithModal();
    await waitForRestoredSession();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    let pending!: Promise<boolean>;
    act(() => {
      // api-client passes a human-readable action (it hides raw route paths
      // behind the 'this action' fallback — see api-client.test.ts).
      pending = requestReAuth('pinning the public wizard form');
    });

    // Modal auto-opens from the REQUIRE_REAUTH context flag, naming the action.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/pinning the public wizard form/)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('Enter your password'), 'hunter2');
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await expect(pending).resolves.toBe(true);
    expect(mockAuthApi.reAuthenticate).toHaveBeenCalledWith({ password: 'hunter2' }, 'tok');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('cancel resolves the gate false and closes the modal (AC2 cancel path)', async () => {
    renderProviderWithModal();
    await waitForRestoredSession();

    let pending!: Promise<boolean>;
    act(() => {
      pending = requestReAuth('pin the public form');
    });
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await expect(pending).resolves.toBe(false);
    expect(mockAuthApi.reAuthenticate).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('a WRONG password keeps the modal open (gate unresolved) until the user succeeds or cancels', async () => {
    mockAuthApi.reAuthenticate.mockResolvedValueOnce({ verified: false });
    renderProviderWithModal();
    await waitForRestoredSession();

    let pending!: Promise<boolean>;
    act(() => {
      pending = requestReAuth('pin the public form');
    });
    await screen.findByRole('dialog');

    await userEvent.type(screen.getByPlaceholderText('Enter your password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    // Modal stays open with an error; the queued request is still pending.
    expect(await screen.findByText(/incorrect password/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Second attempt succeeds.
    mockAuthApi.reAuthenticate.mockResolvedValueOnce({ verified: true });
    await userEvent.type(screen.getByPlaceholderText('Enter your password'), 'right');
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await expect(pending).resolves.toBe(true);
  });
});
