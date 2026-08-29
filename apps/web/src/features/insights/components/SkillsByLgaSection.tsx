import type { SkillsByLga } from '@oslsr/types';
import { skillLabelForSlug } from '@oslsr/types';

/**
 * Skills × LGA — "who can do what, where".
 *
 * ⭐ This is the Registry's purpose stated as a chart: an employer's actual question and
 * a commissioner's. Both axes are ~99% populated on every intake route, so it needs no
 * caveat — unlike the deep-field metrics this page dropped on 2026-08-26.
 *
 * ⚠️ THE EMPTY STATE IS A REAL AND HONEST READING, not a bug. Cells are emitted by the
 * API only at or above the public k-anonymity floor (10), because a rare trade in a
 * thinly-registered LGA can identify one person — and "present but fewer than 10" still
 * discloses that, which is why this is FLOORED rather than banded like the density map.
 * At today's volume almost nothing clears the floor. It fills in as the register grows,
 * and saying so is better than showing a chart of ones and twos.
 */
export function SkillsByLgaSection({ skillsByLga }: { skillsByLga: SkillsByLga[] }) {
  const populated = (skillsByLga ?? []).filter((l) => l.skills.length > 0);

  return (
    <section aria-labelledby="skills-lga-heading">
      <h2 id="skills-lga-heading" className="text-2xl font-bold text-neutral-900 mb-2">
        Trades by Local Government
      </h2>
      <p className="mb-6 text-sm text-neutral-600">
        Where each trade is concentrated. A trade appears for an LGA only where at least
        10 people there have registered it, so no individual can be identified.
      </p>

      {populated.length === 0 ? (
        <div
          className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-600"
          data-testid="skills-lga-empty"
        >
          No local government yet has 10 or more people registered in a single trade.
          This fills in as more people join.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="skills-lga-grid">
          {populated.map((lga) => (
            <div key={lga.lgaId} className="rounded-lg border border-neutral-200 p-4">
              <h3 className="mb-3 font-semibold text-neutral-800">
                {lga.lgaId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </h3>
              <ul className="space-y-1 text-sm">
                {lga.skills.slice(0, 6).map((s) => (
                  <li key={s.skill} className="flex justify-between gap-2">
                    <span className="text-neutral-700">{skillLabelForSlug(s.skill)}</span>
                    <span className="font-medium text-neutral-900">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
