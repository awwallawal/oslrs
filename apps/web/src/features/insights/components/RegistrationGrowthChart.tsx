import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { RegistrationGrowthPoint } from '@oslsr/types';

/**
 * Registrations over time.
 *
 * ⭐ The one series on this page that can NEVER need a caveat: `created_at` is universal
 * by construction — every respondent has one, on every intake route. No denominator, no
 * suppression, no stratum to explain.
 */
export function RegistrationGrowthChart({ growth }: { growth: RegistrationGrowthPoint[] }) {
  if (!growth || growth.length < 2) return null;

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

  return (
    <section aria-labelledby="growth-heading">
      <h2 id="growth-heading" className="text-2xl font-bold text-neutral-900 mb-2">
        Registrations Over Time
      </h2>
      <p className="mb-6 text-sm text-neutral-600">
        Every person on the Registry, counted from the day they registered.
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={growth.map((g) => ({ ...g, label: fmt(g.day) }))}>
          <defs>
            <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9C1E23" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#9C1E23" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            formatter={(v) => [Number(v ?? 0).toLocaleString(), 'Registered']}
            labelFormatter={(l) => `As at ${l}`}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="#9C1E23"
            strokeWidth={2}
            fill="url(#growthFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
