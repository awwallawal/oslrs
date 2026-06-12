/**
 * Story 9-54 AC1 — runtime XLSForm `calculate` evaluator.
 *
 * Evaluates the EXPLICIT SAFE SUBSET of XLSForm calculation expressions present
 * in the OSLSR master form. No `eval` / `Function` — a hand-written recursive
 * descent parser over a fixed grammar. Anything outside the subset throws an
 * {@link UnsupportedCalculateError}; a data-dependent gap (a referenced field
 * not yet answered, or a non-numeric/non-date value) yields `undefined` so the
 * caller can leave the computed field blank rather than crash.
 *
 * Supported subset:
 *   - `today()`                       — current date (injected clock; never Date.now)
 *   - `${field}`                      — number, or date string (→ days since epoch)
 *   - integer / decimal literals
 *   - binary `+`  `-`  `*`  `div`     — (`div` is XLSForm float division)
 *   - `int( … )`                      — truncate toward zero
 *   - parentheses, unary minus
 *
 * Dates are resolved to days-since-Unix-epoch (UTC) so date subtraction
 * (`today() - ${dob}`) yields a plain day count usable in arithmetic — exactly
 * what `int((today() - ${dob}) div 365.25)` (the master form's `age`) needs.
 *
 * CLOCK CONTRACT (Story 9-54 M3): both `today()` and `${dateField}` are reduced
 * to their UTC calendar day (`Date.UTC` / `getUTC*`), so client and server agree
 * regardless of either machine's timezone. The only residual is the wall-clock
 * INSTANT of evaluation (the client computes at render, the server at submit) —
 * which is why AC1.3 makes the SERVER recompute authoritative: the persisted
 * value and any server-side gate use the server's `today`, never the client's.
 */

import type { Calculation } from '@oslsr/types';

/** Thrown when an expression uses syntax/functions outside the safe subset. */
export class UnsupportedCalculateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedCalculateError';
  }
}

/**
 * Internal sentinel: a referenced field is absent/empty or holds a value that
 * cannot be coerced to a number/date. Distinct from UnsupportedCalculateError
 * (a structural problem) — this just means "not computable yet", so the public
 * API returns `undefined` rather than throwing.
 */
class IncomputableError extends Error {}

const MS_PER_DAY = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}/; // YYYY-MM-DD (optionally followed by time)

/** Days since the Unix epoch (UTC) for a YYYY-MM-DD[...] date string. */
function dateStringToEpochDays(value: string): number | null {
  const m = value.match(DATE_RE);
  if (!m) return null;
  const [y, mo, d] = m[0].slice(0, 10).split('-').map(Number);
  const ms = Date.UTC(y, mo - 1, d);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / MS_PER_DAY);
}

/** Days since the Unix epoch (UTC) for the injected `today` clock. */
function todayToEpochDays(today: Date): number {
  return Math.floor(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / MS_PER_DAY,
  );
}

// ── Tokenizer ───────────────────────────────────────────────────────────────

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'field'; name: string }
  | { kind: 'ident'; name: string } // today, int, div
  | { kind: 'op'; value: '+' | '-' | '*' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = expr.length;

  while (i < n) {
    const c = expr[i];

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }

    if (c === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*') {
      tokens.push({ kind: 'op', value: c });
      i++;
      continue;
    }

    // ${field}
    if (c === '$' && expr[i + 1] === '{') {
      const end = expr.indexOf('}', i + 2);
      if (end === -1) {
        throw new UnsupportedCalculateError(`Unterminated \${...} in expression: "${expr}"`);
      }
      const name = expr.slice(i + 2, end).trim();
      if (!name) {
        throw new UnsupportedCalculateError(`Empty \${} reference in expression: "${expr}"`);
      }
      tokens.push({ kind: 'field', name });
      i = end + 1;
      continue;
    }

    // number (integer or decimal)
    if ((c >= '0' && c <= '9') || (c === '.' && expr[i + 1] >= '0' && expr[i + 1] <= '9')) {
      let j = i;
      while (j < n && ((expr[j] >= '0' && expr[j] <= '9') || expr[j] === '.')) j++;
      const raw = expr.slice(i, j);
      const num = Number(raw);
      if (Number.isNaN(num)) {
        throw new UnsupportedCalculateError(`Invalid number "${raw}" in expression: "${expr}"`);
      }
      tokens.push({ kind: 'num', value: num });
      i = j;
      continue;
    }

    // identifier (function name or `div` operator)
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_-]/.test(expr[j])) j++;
      tokens.push({ kind: 'ident', name: expr.slice(i, j) });
      i = j;
      continue;
    }

    throw new UnsupportedCalculateError(`Unexpected character "${c}" in expression: "${expr}"`);
  }

  return tokens;
}

// ── Recursive-descent parser/evaluator ───────────────────────────────────────

class Evaluator {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly formData: Record<string, unknown>,
    private readonly todayDays: number,
    private readonly source: string,
  ) {}

  evaluate(): number {
    const value = this.parseExpr();
    if (this.pos !== this.tokens.length) {
      throw new UnsupportedCalculateError(`Unexpected trailing tokens in expression: "${this.source}"`);
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  // expr := term (('+' | '-') term)*
  private parseExpr(): number {
    let value = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t && t.kind === 'op' && (t.value === '+' || t.value === '-')) {
        this.pos++;
        const rhs = this.parseTerm();
        value = t.value === '+' ? value + rhs : value - rhs;
      } else {
        break;
      }
    }
    return value;
  }

  // term := factor (('*' | 'div') factor)*
  private parseTerm(): number {
    let value = this.parseFactor();
    for (;;) {
      const t = this.peek();
      if (t && t.kind === 'op' && t.value === '*') {
        this.pos++;
        value = value * this.parseFactor();
      } else if (t && t.kind === 'ident' && t.name === 'div') {
        this.pos++;
        value = value / this.parseFactor();
      } else {
        break;
      }
    }
    return value;
  }

  // factor := number | field | today() | int(expr) | (expr) | -factor
  private parseFactor(): number {
    const t = this.peek();
    if (!t) {
      throw new UnsupportedCalculateError(`Unexpected end of expression: "${this.source}"`);
    }

    if (t.kind === 'op' && t.value === '-') {
      this.pos++;
      return -this.parseFactor();
    }
    if (t.kind === 'op' && t.value === '+') {
      this.pos++;
      return this.parseFactor();
    }

    if (t.kind === 'num') {
      this.pos++;
      return t.value;
    }

    if (t.kind === 'field') {
      this.pos++;
      return this.resolveField(t.name);
    }

    if (t.kind === 'lparen') {
      this.pos++;
      const value = this.parseExpr();
      this.expect('rparen');
      return value;
    }

    if (t.kind === 'ident') {
      if (t.name === 'today') {
        this.pos++;
        this.expect('lparen');
        this.expect('rparen');
        return this.todayDays;
      }
      if (t.name === 'int') {
        this.pos++;
        this.expect('lparen');
        const value = this.parseExpr();
        this.expect('rparen');
        return Math.trunc(value);
      }
      throw new UnsupportedCalculateError(
        `Unsupported function/identifier "${t.name}" in expression: "${this.source}"`,
      );
    }

    throw new UnsupportedCalculateError(`Unexpected token in expression: "${this.source}"`);
  }

  private expect(kind: 'lparen' | 'rparen'): void {
    const t = this.peek();
    if (!t || t.kind !== kind) {
      throw new UnsupportedCalculateError(
        `Expected ${kind === 'lparen' ? '(' : ')'} in expression: "${this.source}"`,
      );
    }
    this.pos++;
  }

  private resolveField(name: string): number {
    const raw = this.formData[name];
    if (raw == null || raw === '') {
      throw new IncomputableError();
    }
    if (typeof raw === 'number') {
      if (Number.isNaN(raw)) throw new IncomputableError();
      return raw;
    }
    if (typeof raw === 'string') {
      const asDays = dateStringToEpochDays(raw);
      if (asDays != null) return asDays;
      const num = Number(raw);
      if (!Number.isNaN(num) && raw.trim() !== '') return num;
      throw new IncomputableError();
    }
    throw new IncomputableError();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate a single XLSForm calculate expression.
 *
 * @returns the numeric result, or `undefined` if the expression references a
 *   field that is absent/empty/non-numeric (not yet computable).
 * @throws {UnsupportedCalculateError} if the expression uses syntax or a
 *   function outside the safe subset.
 */
export function evaluateCalculate(
  expression: string,
  formData: Record<string, unknown>,
  today: Date,
): number | undefined {
  const tokens = tokenize(expression);
  const todayDays = todayToEpochDays(today);
  try {
    const value = new Evaluator(tokens, formData, todayDays, expression).evaluate();
    // A non-finite result (Infinity from `div 0`, NaN from `0 div 0`, or
    // overflow) is not a usable computed value — treat it as incomputable so it
    // is left undefined rather than persisted / fed into a skip-logic gate.
    if (!Number.isFinite(value)) return undefined;
    return value;
  } catch (err) {
    if (err instanceof IncomputableError) return undefined;
    throw err;
  }
}

export interface EvaluateCalculationsOptions {
  /**
   * Called when an expression throws {@link UnsupportedCalculateError}. The
   * offending calculation is skipped (left undefined). Lets API callers log
   * `forms.calculate.unsupported` without coupling the evaluator to Pino.
   */
  onUnsupported?: (calc: Calculation, error: UnsupportedCalculateError) => void;
}

/**
 * Evaluate an ordered list of calculations against `formData`, returning a map
 * of `{ [name]: number }` for every calculation that resolved to a value.
 *
 * Calculations are evaluated in array order against a working copy that
 * accumulates prior results, so a later calculation may reference an earlier
 * one. Unsupported expressions are skipped (and reported via `onUnsupported`)
 * rather than aborting the whole batch — a single bad calc must not blank the
 * others.
 */
export function evaluateCalculations(
  calculations: Calculation[] | undefined,
  formData: Record<string, unknown>,
  today: Date,
  options: EvaluateCalculationsOptions = {},
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!calculations || calculations.length === 0) return result;

  // Working copy lets calc N reference computed values from calc <N.
  const working: Record<string, unknown> = { ...formData };

  for (const calc of calculations) {
    try {
      const value = evaluateCalculate(calc.expression, working, today);
      if (value !== undefined) {
        result[calc.name] = value;
        working[calc.name] = value;
      }
    } catch (err) {
      if (err instanceof UnsupportedCalculateError) {
        options.onUnsupported?.(calc, err);
        continue;
      }
      throw err;
    }
  }

  return result;
}

/**
 * Convenience: return `formData` merged with all computed calculation values.
 * Used by skip-logic/completeness callers that need the cumulative answer map
 * including computed fields (e.g. so `${age} >= 15` resolves).
 */
export function withCalculatedFields(
  formData: Record<string, unknown>,
  calculations: Calculation[] | undefined,
  today: Date,
  options: EvaluateCalculationsOptions = {},
): Record<string, unknown> {
  const computed = evaluateCalculations(calculations, formData, today, options);
  return { ...formData, ...computed };
}
