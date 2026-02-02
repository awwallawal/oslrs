/**
 * Production-safe logger utility.
 * Only logs in development mode to avoid Lighthouse Best Practices warnings.
 */

/* eslint-disable no-console */

const isDev = import.meta.env.DEV;

export const logger = {
  /**
   * Log an error message (only in development)
   */
  error: (...args: unknown[]): void => {
    if (isDev) {
      console.error(...args);
    }
  },

  /**
   * Log a warning message (only in development)
   */
  warn: (...args: unknown[]): void => {
    if (isDev) {
      console.warn(...args);
    }
  },

  /**
   * Log an info message (only in development)
   */
  info: (...args: unknown[]): void => {
    if (isDev) {
      console.info(...args);
    }
  },

  /**
   * Log a debug message (only in development)
   */
  debug: (...args: unknown[]): void => {
    if (isDev) {
      console.debug(...args);
    }
  },
};

export default logger;
