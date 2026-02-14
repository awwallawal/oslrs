// @vitest-environment jsdom
import * as matchers from '@testing-library/jest-dom/matchers';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';

import { ValidationResultDisplay } from '../components/ValidationResultDisplay';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

describe('ValidationResultDisplay', () => {
  it('renders nothing when no errors or warnings', () => {
    const { container } = render(
      <ValidationResultDisplay result={{ errors: [], warnings: [] }} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders error messages', () => {
    render(
      <ValidationResultDisplay
        result={{
          errors: [
            { worksheet: 'survey', row: 5, message: "Invalid type 'textt'", severity: 'error' },
          ],
          warnings: [],
        }}
      />
    );
    expect(screen.getByText(/1 Error/)).toBeInTheDocument();
    expect(screen.getByText(/Invalid type 'textt'/)).toBeInTheDocument();
    expect(screen.getByText('[survey]')).toBeInTheDocument();
    expect(screen.getByText('Row 5:')).toBeInTheDocument();
  });

  it('renders warning messages', () => {
    render(
      <ValidationResultDisplay
        result={{
          errors: [],
          warnings: [
            { worksheet: 'survey', message: 'consent_enriched not found', severity: 'warning' },
          ],
        }}
      />
    );
    expect(screen.getByText(/1 Warning/)).toBeInTheDocument();
    expect(screen.getByText(/consent_enriched not found/)).toBeInTheDocument();
  });

  it('renders both errors and warnings together', () => {
    render(
      <ValidationResultDisplay
        result={{
          errors: [
            { message: 'Error 1', severity: 'error' },
            { message: 'Error 2', severity: 'error' },
          ],
          warnings: [
            { message: 'Warning 1', severity: 'warning' },
          ],
        }}
      />
    );
    expect(screen.getByText(/2 Errors/)).toBeInTheDocument();
    expect(screen.getByText(/1 Warning/)).toBeInTheDocument();
  });
});
