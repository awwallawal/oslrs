/**
 * Supervisor Messages Page
 *
 * Story 2.5-4 AC3: Sidebar link target for Messages
 * Placeholder page — real messaging in Epic 4 Story 4-2.
 */

import { MessageSquare } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';

export default function SupervisorMessagesPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">Messages</h1>
        <p className="text-neutral-600 mt-1">Communicate with your team</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="w-12 h-12 text-neutral-300 mb-4" />
          <p className="text-neutral-500 font-medium">No messages yet</p>
          <p className="text-sm text-neutral-400 mt-1">
            Team messaging will be available in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
