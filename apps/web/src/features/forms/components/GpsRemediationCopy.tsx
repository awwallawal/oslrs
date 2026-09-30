import type { GpsRemediation } from '../lib/gps-remediation';

/**
 * Story 13-76 Task 2.4 — ONE renderer for the one copy source.
 *
 * 13-75 made the TEXT single-sourced; the amber block and the location question
 * still each laid it out themselves. 13-76 AC7 adds labelled per-platform lines, and
 * a third field rendered twice by hand is how one surface ends up showing it and the
 * other not. Each caller keeps its own wrapper (test id, role) and passes its colour.
 */
export function GpsRemediationCopy({
  remediation,
  className,
}: {
  remediation: GpsRemediation;
  className: string;
}) {
  return (
    <>
      <p className={className}>{remediation.action}</p>
      {remediation.secondary && <p className={className}>{remediation.secondary}</p>}
      {remediation.platformSteps?.map(({ platform, step }) => (
        <p key={platform} className={className} data-testid={`gps-remediation-step-${platform}`}>
          <span className="font-semibold">{platform}:</span> {step}
        </p>
      ))}
    </>
  );
}
