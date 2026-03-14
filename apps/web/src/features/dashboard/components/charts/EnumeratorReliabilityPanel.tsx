/**
 * Enumerator Reliability Panel
 * Story 8.8 AC#5: Distribution comparison charts + divergence heatmap + flag badges.
 */

import type { EnumeratorReliabilityData, ThresholdStatus } from '@oslsr/types';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { ThresholdGuard } from '../ThresholdGuard';

interface EnumeratorReliabilityPanelProps {
  data: EnumeratorReliabilityData | undefined;
  isLoading: boolean;
  error: unknown;
  /** When true, only show flagged pairs (no full heatmap) — used for assessor view */
  flagsOnly?: boolean;
}

function getFlagBadge(flag: 'normal' | 'amber' | 'red') {
  if (flag === 'red') return <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">High Divergence</span>;
  if (flag === 'amber') return <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Moderate Divergence</span>;
  return null;
}

function getHeatColor(value: number): string {
  if (value >= 0.7) return 'bg-red-200 text-red-900';
  if (value >= 0.5) return 'bg-amber-200 text-amber-900';
  if (value >= 0.3) return 'bg-yellow-100 text-yellow-800';
  return 'bg-green-100 text-green-800';
}

function ThresholdMessage({ threshold }: { threshold: ThresholdStatus }) {
  return (
    <ThresholdGuard threshold={threshold} label="Enumerator Reliability">
      <></>
    </ThresholdGuard>
  );
}

export function EnumeratorReliabilityPanel({
  data,
  isLoading,
  error,
  flagsOnly = false,
}: EnumeratorReliabilityPanelProps) {
  if (isLoading) {
    return (
      <Card data-testid="reliability-loading">
        <CardContent className="py-8 text-center text-neutral-400 animate-pulse">
          Loading reliability analysis...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid="reliability-error">
        <CardContent className="py-8 text-center text-red-600">
          Failed to load enumerator reliability data.
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  if (!data.threshold.met) {
    return (
      <Card data-testid="reliability-threshold">
        <CardHeader>
          <CardTitle className="text-base">Enumerator Reliability</CardTitle>
        </CardHeader>
        <CardContent>
          <ThresholdMessage threshold={data.threshold} />
        </CardContent>
      </Card>
    );
  }

  const flaggedPairs = data.pairs.filter(p => p.flag !== 'normal');
  const displayPairs = flagsOnly ? flaggedPairs : data.pairs;

  return (
    <div className="space-y-4" data-testid="reliability-panel">
      <h3 className="text-lg font-semibold text-neutral-900">Enumerator Reliability</h3>

      {/* Distribution Comparison */}
      {!flagsOnly && data.enumerators.length > 0 && (
        <Card data-testid="reliability-distributions">
          <CardHeader>
            <CardTitle className="text-sm">Answer Distribution Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {(data.enumerators[0]?.distributions.map(d => d.question) ?? []).map(question => (
                <div key={question}>
                  <h4 className="text-xs font-medium text-neutral-500 mb-2 capitalize">
                    {question.replace(/_/g, ' ')}
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 pr-3">Enumerator</th>
                          {(() => {
                            const allLabels = new Set<string>();
                            data.enumerators.forEach(e => {
                              const dist = e.distributions.find(d => d.question === question);
                              dist?.answers.forEach(a => allLabels.add(a.label));
                            });
                            return [...allLabels].sort().map(label => (
                              <th key={label} className="text-center px-2 py-1">{label}</th>
                            ));
                          })()}
                        </tr>
                      </thead>
                      <tbody>
                        {data.enumerators.map(e => {
                          const dist = e.distributions.find(d => d.question === question);
                          const allLabels = new Set<string>();
                          data.enumerators.forEach(en => {
                            const dd = en.distributions.find(d => d.question === question);
                            dd?.answers.forEach(a => allLabels.add(a.label));
                          });
                          return (
                            <tr key={e.enumeratorId} className="border-b last:border-0">
                              <td className="py-1 pr-3 font-medium truncate max-w-[150px]">{e.enumeratorName}</td>
                              {[...allLabels].sort().map(label => {
                                const answer = dist?.answers.find(a => a.label === label);
                                return (
                                  <td key={label} className="text-center px-2 py-1">
                                    {answer ? `${(answer.proportion * 100).toFixed(0)}%` : '—'}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Divergence Heatmap */}
      {!flagsOnly && displayPairs.length > 0 && (
        <Card data-testid="reliability-heatmap">
          <CardHeader>
            <CardTitle className="text-sm">Pairwise Divergence Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1">Pair</th>
                    {(data.enumerators[0]?.distributions.map(d => d.question) ?? []).map(q => (
                      <th key={q} className="text-center px-2 py-1 capitalize">{q.replace(/_/g, ' ')}</th>
                    ))}
                    <th className="text-center px-2 py-1">Average</th>
                    <th className="text-center px-2 py-1">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {displayPairs.map((pair, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 pr-3 text-xs">
                        {pair.enumeratorA} vs {pair.enumeratorB}
                      </td>
                      {pair.divergenceScores.map(ds => (
                        <td key={ds.question} className={`text-center px-2 py-1 ${getHeatColor(ds.jsDivergence)}`}>
                          {ds.jsDivergence.toFixed(3)}
                        </td>
                      ))}
                      <td className={`text-center px-2 py-1 font-medium ${getHeatColor(pair.avgDivergence)}`}>
                        {pair.avgDivergence.toFixed(3)}
                      </td>
                      <td className="text-center px-2 py-1">{getFlagBadge(pair.flag)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flagged Pair Interpretations */}
      {flaggedPairs.length > 0 && (
        <Card data-testid="reliability-flags">
          <CardHeader>
            <CardTitle className="text-sm">Flagged Pairs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {flaggedPairs.map((pair, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-neutral-50">
                  {getFlagBadge(pair.flag)}
                  <p className="text-sm text-neutral-700">{pair.interpretation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {flaggedPairs.length === 0 && (
        <Card data-testid="reliability-no-flags">
          <CardContent className="py-6 text-center text-neutral-500 text-sm">
            No significant divergences detected between enumerators.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
