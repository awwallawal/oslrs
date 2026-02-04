/**
 * Test utilities for React components
 *
 * Provides wrapper components and helper functions for testing
 * with React Router v7 future flags enabled.
 */

import { ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * React Router v7 future flags
 * Must be included in all router instances to suppress deprecation warnings
 */
export const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

/**
 * Creates a MemoryRouter with v7 future flags enabled
 */
export function createTestRouter(
  children: ReactNode,
  options?: Omit<MemoryRouterProps, 'children'>
) {
  return (
    <MemoryRouter future={routerFutureFlags} {...options}>
      {children}
    </MemoryRouter>
  );
}

/**
 * Creates a QueryClient configured for testing
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface RenderWithRouterOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
  initialIndex?: number;
}

/**
 * Renders a component with React Router and React Query providers
 * Includes v7 future flags to suppress deprecation warnings
 */
export function renderWithRouter(
  ui: ReactNode,
  {
    initialEntries = ['/'],
    initialIndex,
    ...renderOptions
  }: RenderWithRouterOptions = {}
) {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          future={routerFutureFlags}
          initialEntries={initialEntries}
          initialIndex={initialIndex}
        >
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

/**
 * Renders a component with only React Query provider (no router)
 */
export function renderWithQueryClient(
  ui: ReactNode,
  renderOptions?: Omit<RenderOptions, 'wrapper'>
) {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

// Re-export everything from @testing-library/react
export * from '@testing-library/react';
