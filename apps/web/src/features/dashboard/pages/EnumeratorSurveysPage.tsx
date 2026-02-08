/**
 * Enumerator Surveys Page (Placeholder)
 *
 * Story 2.5-5 AC2: Shows list of active questionnaires or empty state.
 * Full survey list implementation in Epic 3.
 */

import { FileText } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';

export default function EnumeratorSurveysPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">Surveys</h1>
        <p className="text-neutral-600 mt-1">Available questionnaires for data collection</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="w-12 h-12 text-neutral-300 mb-4" />
          <p className="text-neutral-500 font-medium">No surveys assigned yet</p>
          <p className="text-sm text-neutral-400 mt-1">Contact your supervisor.</p>
        </CardContent>
      </Card>
    </div>
  );
}
