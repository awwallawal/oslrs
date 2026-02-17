/**
 * Supervisor Messages Page
 *
 * Story 2.5-4 AC3: Sidebar link target for Messages
 * Story prep-6: PoC test harness for realtime transport verification.
 * Full chat UI will be implemented in Story 4.2.
 */

import { MessageSquare } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { RealtimeStatusBanner } from '../../../components/RealtimeStatusBanner';
import { useRealtimeConnection } from '../../../hooks/useRealtimeConnection';

export default function SupervisorMessagesPage() {
  const { connectionState, isConnected, isDegraded, socket } = useRealtimeConnection();

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-brand font-semibold text-neutral-900">Messages</h1>
          <p className="text-neutral-600 mt-1">Communicate with your team</p>
        </div>
        <RealtimeStatusBanner connectionState={connectionState} />
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="w-12 h-12 text-neutral-300 mb-4" />
          {isConnected ? (
            <>
              <p className="text-neutral-500 font-medium">Connected to realtime transport</p>
              <p className="text-sm text-neutral-400 mt-1">
                Socket ID: {socket?.id ?? 'N/A'}
              </p>
            </>
          ) : (
            <>
              <p className="text-neutral-500 font-medium">No messages yet</p>
              <p className="text-sm text-neutral-400 mt-1">
                {isDegraded
                  ? 'Realtime connection unavailable — using polling fallback.'
                  : 'Team messaging will be available in a future update.'}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
