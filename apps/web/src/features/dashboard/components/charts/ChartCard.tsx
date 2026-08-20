/**
 * ChartCard — the shared analytics chart-card header. Story 12-5 (AC4.3).
 *
 * Two near-identical private `ChartCard`s and several hand-rolled copies of the
 * same `CardHeader`/maroon-rule markup used to live across the chart files, so
 * "add the denominator to every chart header" had no single place to happen.
 * This is that place. It is intentionally the SAME markup those copies rendered
 * — adopting it changes no pixels — plus one additive, optional `n`.
 *
 * The `n` prop is additive by design (AC4.3): a card that does not pass it
 * renders exactly as it did before, so charts can adopt the denominator one at
 * a time without a flag day and without any chart being forked or rebuilt.
 *
 * ⚠️ `n` is the denominator THAT chart was counted over, not a house number.
 * Per-chart Ns legitimately differ — from each other, from the answers subset,
 * and from the registry total — because a question fewer people were asked has
 * a smaller denominator. Normalising them all to one number would re-introduce
 * the defect this story exists to remove. Pass the total the chart already
 * computed; never a blanket figure.
 */

import { ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { countedOverCaption, formatN } from '../../utils/registry-copy';

export interface ChartCardProps {
  title: string;
  /**
   * The denominator this chart was actually counted over. Renders as "N = 76"
   * under the title. Omit ONLY when the chart genuinely has no denominator
   * (e.g. a time series of events rather than a distribution over people).
   */
  n?: number;
  /**
   * Optional plain-language line under the title (and under `n`, if both).
   *
   * Used by charts whose base is NOT a denominator over people — a time series
   * carries `subtitle={rangeTotalCaption(total)}` rather than `n`, so its event
   * count is never mistaken for a share of the registry.
   */
  subtitle?: string;
  /** Right-hand header controls (view toggles, range pickers). */
  actions?: React.ReactNode;
  className?: string;
  /** Height wrapper for the body. Defaults to the h-80 the chart cards used. */
  bodyClassName?: string;
  /**
   * Escape hatch for the charts whose height scales with row count. Kept
   * because those call sites already computed a pixel height; it adds no new
   * inline-style site beyond the ones Story 12-11 will migrate.
   */
  bodyStyle?: React.CSSProperties;
  /**
   * Wrap children in a recharts `ResponsiveContainer`. Some callers pass a bare
   * chart element (needs the wrapper); others bring their own.
   */
  responsive?: boolean;
  'data-testid'?: string;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  n,
  subtitle,
  actions,
  className,
  bodyClassName = 'h-80',
  bodyStyle,
  responsive = false,
  'data-testid': testId,
  children,
}: ChartCardProps) {
  return (
    <Card className={className} data-testid={testId}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="border-l-4 border-[#9C1E23] pl-3">
            <CardTitle className="text-base">{title}</CardTitle>
            {n != null && (
              // AC5: the figure stays terse ("N = 76") and the plain-language
              // reading of it rides along as the tooltip, so the explainer is
              // one shared string rather than a second line on 20 cards.
              <p
                className="text-xs text-neutral-500 mt-0.5"
                data-testid="chart-n"
                title={countedOverCaption(n)}
              >
                {formatN(n)}
              </p>
            )}
            {subtitle && (
              <p className="text-xs text-neutral-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent>
        <div className={bodyClassName} style={bodyStyle}>
          {responsive ? (
            <ResponsiveContainer width="100%" height="100%">
              {children as React.ReactElement}
            </ResponsiveContainer>
          ) : (
            children
          )}
        </div>
      </CardContent>
    </Card>
  );
}
