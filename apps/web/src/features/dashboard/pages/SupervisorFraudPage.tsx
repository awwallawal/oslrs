/**
 * Supervisor Fraud Alerts Page
 *
 * Story 2.5-4 AC3: Sidebar link target for Fraud Alerts
 * Placeholder page — real fraud detection in Epic 4 Stories 4-3/4-4.
 */

import { Shield } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';

export default function SupervisorFraudPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">Fraud Alerts</h1>
        <p className="text-neutral-600 mt-1">Review flagged submissions and suspicious activity</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Shield className="w-12 h-12 text-neutral-300 mb-4" />
          <p className="text-neutral-500 font-medium">No fraud alerts</p>
          <p className="text-sm text-neutral-400 mt-1">
            Fraud detection will be available in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
