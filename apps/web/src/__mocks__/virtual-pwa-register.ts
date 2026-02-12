// Mock for virtual:pwa-register (Vite virtual module from vite-plugin-pwa)
// Used in tests because the virtual module is only available during Vite build
import { vi } from 'vitest';

type RegisterSWOptions = {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (swUrl: string, registration: unknown) => void;
  onRegisterError?: (error: Error) => void;
};

type UpdateFn = (reloadPage?: boolean) => Promise<void>;

// Store callbacks for test access
export let __capturedCallbacks: RegisterSWOptions = {};
export const __mockUpdateSW = vi.fn().mockResolvedValue(undefined);

export function registerSW(options: RegisterSWOptions): UpdateFn {
  __capturedCallbacks = options;
  return __mockUpdateSW;
}
