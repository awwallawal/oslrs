/**
 * Enumerator Drafts Page (Placeholder)
 *
 * Story 2.5-5 AC4: Sidebar link target for Drafts.
 * Full draft management in Epic 3.
 */

import { Save } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';

export default function EnumeratorDraftsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">Drafts</h1>
        <p className="text-neutral-600 mt-1">Saved survey drafts for offline completion</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Save className="w-12 h-12 text-neutral-300 mb-4" />
          <p className="text-neutral-500 font-medium">No drafts saved</p>
          <p className="text-sm text-neutral-400 mt-1">Start a survey to save drafts for later.</p>
        </CardContent>
      </Card>
    </div>
  );
}
