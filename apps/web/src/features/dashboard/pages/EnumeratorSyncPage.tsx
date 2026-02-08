/**
 * Enumerator Sync Status Page (Placeholder)
 *
 * Story 2.5-5 AC4: Sidebar link target for Sync Status.
 * Full sync management in Epic 3.
 */

import { CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';

export default function EnumeratorSyncPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">Sync Status</h1>
        <p className="text-neutral-600 mt-1">Data synchronization and upload status</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-600 rounded-full text-sm font-medium mb-4">
            <CheckCircle className="w-4 h-4" />
            <span>All data synced</span>
          </div>
          <p className="text-sm text-neutral-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last synced: just now
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
