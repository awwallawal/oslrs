/**
 * Top Flagged Enumerators Table — ranked table with clickable rows
 * Story 8.4 AC#1, AC#2 — row click navigates to audit queue filtered by enumeratorId
 */

import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/card';
import { SkeletonCard } from '../../../../components/skeletons';
import { ChartExportButton } from './ChartExportButton';
import type { TopFlaggedEnumerator } from '@oslsr/types';

interface Props {
  data?: TopFlaggedEnumerator[];
  isLoading: boolean;
  error: Error | null;
  className?: string;
}

export default function TopFlaggedEnumeratorsTable({ data, isLoading, error, className }: Props) {
  const navigate = useNavigate();

  if (isLoading) return <SkeletonCard className={className} />;

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-red-600">Failed to load flagged enumerators</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-neutral-500">No flagged enumerators</CardContent>
      </Card>
    );
  }

  const handleRowClick = (enumeratorId: string) => {
    navigate(`/dashboard/assessor/queue?enumeratorId=${enumeratorId}`);
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="border-l-4 border-[#9C1E23] pl-3">
            <CardTitle className="text-base">Top Flagged Enumerators</CardTitle>
            <p className="text-xs text-neutral-500 mt-1">Click a row to view in audit queue</p>
          </div>
          <ChartExportButton data={data} filename="top-flagged-enumerators" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium text-right">Flags</th>
                <th className="pb-2 font-medium text-right">Critical</th>
                <th className="pb-2 font-medium text-right">High</th>
                <th className="pb-2 font-medium text-right">Approval %</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e, i) => (
                <tr
                  key={e.enumeratorId}
                  onClick={() => handleRowClick(e.enumeratorId)}
                  className="border-b cursor-pointer hover:bg-neutral-50 transition-colors"
                  data-testid={`flagged-enumerator-row-${i}`}
                >
                  <td className="py-2 text-neutral-400">{i + 1}</td>
                  <td className="py-2 font-medium">{e.name}</td>
                  <td className="py-2 text-right">{e.flagCount}</td>
                  <td className="py-2 text-right text-red-600">{e.criticalCount}</td>
                  <td className="py-2 text-right text-amber-600">{e.highCount}</td>
                  <td className="py-2 text-right">{(e.approvalRate * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
