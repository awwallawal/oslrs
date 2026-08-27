/**
 * Campaign Watch — did the radio spend move the register?
 *
 * Route: `/dashboard/super-admin/campaign-watch` (super-admin only).
 *
 * ⭐ The design principle, and it is the opposite of the public /insights page's:
 * SHOW THE CAVEAT FIRST. On a public surface a qualifier is a screenshot risk, so that
 * page publishes only figures that need none. Here the reader is one accountable person
 * in a room who can ask a question — so the uncertainty goes at the TOP, before the
 * number it qualifies, and the unattributed rows get their own column rather than being
 * quietly dropped out of a percentage.
 */
import { AlertTriangle, Radio, TrendingUp, Users } from 'lucide-react';
import { useCampaignWatch } from '../api/campaign-watch.api';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';

function Stat({ icon: Icon, label, value, sub }: {
  icon: typeof Users; label: string; value: string; sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-neutral-500 text-sm">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <div className="mt-1 text-3xl font-bold text-neutral-900">{value}</div>
        {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function CampaignWatchPage() {
  const { data, isLoading, error } = useCampaignWatch();

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="campaign-watch-loading">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        Unable to load campaign watch.
      </div>
    );
  }

  const lift = data.totalNow - data.baseline;
  const liftPct = data.baseline > 0 ? Math.round((lift / data.baseline) * 1000) / 10 : null;
  const radio = data.byChannel.find((c) => c.channel === 'Radio')?.count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Campaign Watch</h1>
        <p className="text-sm text-neutral-500">
          Registrations since the first spot aired, and what registrants said brought them.
          Baseline is the register the day before the campaign started.
        </p>
      </div>

      {/*
        ⭐ THE CAVEAT LEADS. Radio is a FLOOR: an unattributed row is not a non-radio row.
        Putting this above the numbers is deliberate — a reader who takes only the
        headline should take the uncertainty with it.
      */}
      {data.attributionCoveragePct !== null && data.attributionCoveragePct < 100 && (
        <div
          className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4"
          data-testid="attribution-caveat"
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <div className="font-semibold">
              {data.attributionCoveragePct}% of registrations named a channel
              {' '}({data.attributedCount} of {data.sinceCampaignStart}).
            </div>
            <div className="mt-1">
              The other <strong>{data.unattributedCount}</strong> did not answer
              &ldquo;How did you hear about us?&rdquo;. They are <strong>not</strong> counted as
              non-radio — so every channel figure below is a <strong>floor, not an estimate</strong>.
              If this percentage keeps falling, radio will look weaker than it is.
            </div>
          </div>
        </div>
      )}

      {data.baselineDrifted && (
        <div
          className="flex gap-3 rounded-lg border border-red-300 bg-red-50 p-4"
          data-testid="baseline-drift"
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div className="text-sm text-red-900">
            <span className="font-semibold">Baseline moved.</span> It reads {data.baseline}
            {' '}but was {data.baselineAtAuthoring} when this was built — the register&apos;s
            history has changed (a backfill, an import, or a deletion). Every comparison on
            this page is against the CURRENT baseline; treat older screenshots as stale.
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Stat icon={Users} label="Baseline (campaign eve)" value={data.baseline.toLocaleString()} />
        <Stat icon={Users} label="Registered now" value={data.totalNow.toLocaleString()} />
        <Stat
          icon={TrendingUp}
          label="Since campaign start"
          value={`+${lift.toLocaleString()}`}
          sub={liftPct !== null ? `${liftPct}% above baseline` : undefined}
        />
        <Stat
          icon={Radio}
          label="Said “Radio”"
          value={radio.toLocaleString()}
          sub="a floor — see the note above"
        />
      </div>

      <Card>
        <CardHeader><CardTitle>How they heard about us</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="py-2">Channel</th>
                <th className="py-2 text-right">Registrations</th>
              </tr>
            </thead>
            <tbody data-testid="channel-rows">
              {data.byChannel.map((c) => (
                <tr key={c.channel ?? 'unattributed'} className="border-b last:border-0">
                  <td className="py-2">
                    {c.channel ?? (
                      <span className="italic text-neutral-500">Did not answer</span>
                    )}
                  </td>
                  <td className="py-2 text-right font-medium">{c.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>By day</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="py-2">Day</th>
                <th className="py-2 text-right">Registrations</th>
                <th className="py-2 text-right">Named a channel</th>
                <th className="py-2 text-right">Said “Radio”</th>
              </tr>
            </thead>
            <tbody data-testid="day-rows">
              {data.byDay.map((d) => (
                <tr key={d.day} className="border-b last:border-0">
                  <td className="py-2">{d.day}</td>
                  <td className="py-2 text-right font-medium">{d.registrations}</td>
                  <td className="py-2 text-right text-neutral-600">{d.attributed}</td>
                  <td className="py-2 text-right font-medium">{d.radio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Radio registrations by LGA</CardTitle></CardHeader>
        <CardContent>
          {data.radioByLga.length === 0 ? (
            <p className="text-sm text-neutral-500">No radio-attributed registrations yet.</p>
          ) : (
            <ul className="grid gap-1 text-sm sm:grid-cols-2" data-testid="radio-lga-rows">
              {data.radioByLga.map((l) => (
                <li key={l.lgaId ?? 'unknown'} className="flex justify-between border-b py-1">
                  <span>{l.lgaId ?? <span className="italic text-neutral-500">No LGA</span>}</span>
                  <span className="font-medium">{l.count}</span>
                </li>
              ))}
            </ul>
          )}
          {/* Reach beyond the broadcast footprint is the interesting read here — a
              station buy that shows up in LGAs it does not cover is word of mouth. */}
          <p className="mt-3 text-xs text-neutral-500">
            LGAs outside a station&apos;s footprint suggest word of mouth rather than reach.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-neutral-400">
        Snapshot generated {new Date(data.generatedAt).toLocaleString('en-NG')} · baseline is
        registrations created before {new Date(data.campaignStart).toLocaleDateString('en-NG')}.
      </p>
    </div>
  );
}
