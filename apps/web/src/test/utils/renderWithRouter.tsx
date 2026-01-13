import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import React from 'react';

interface RenderWithRouterOptions {
  route?: string;
  future?: {
    v7_startTransition: boolean;
    v7_relativeSplatPath: boolean;
  };
}

export function renderWithRouter(
  ui: React.ReactNode,
  {
    route = '/',
    future = {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  }: RenderWithRouterOptions = {}
) {
  window.history.pushState({}, 'Test', route);

  return render(
    <MemoryRouter
      initialEntries={[route]}
      future={future}
    >
      {ui}
    </MemoryRouter>
  );
}
