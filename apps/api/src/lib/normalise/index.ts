/**
 * Barrel export for the input-normalisation library.
 * Downstream callers (services, scripts, validate middleware) should import
 * from here rather than reaching into individual module files.
 */

export type { NormaliseResult, NormaliseDateResult } from './types.js';
export { normaliseEmail } from './email.js';
export { normaliseNigerianPhone } from './phone.js';
export { normaliseFullName } from './name.js';
export { normaliseDate, type DateFormat } from './date.js';
export { normaliseTrade } from './trade.js';
