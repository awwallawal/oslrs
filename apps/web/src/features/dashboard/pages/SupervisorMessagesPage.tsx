/**
 * Supervisor Messages Page
 *
 * Story 4.2: Full team messaging interface for supervisors.
 * Left panel: inbox (conversation threads) + broadcast action.
 * Right panel: active thread view + message composer.
 * Mobile: inbox list first, tap to navigate to thread.
 */

import { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { RealtimeStatusBanner } from '../../../components/RealtimeStatusBanner';
import { useRealtimeConnection } from '../../../hooks/useRealtimeConnection';
import { useAuth } from '../../auth/context/AuthContext';
import { Skeleton } from '../../../components/ui/skeleton';
import { useInbox, useThread, useSendMessage, useSendBroadcast, useMarkThreadAsRead, useMessageRealtime } from '../hooks/useMessages';
import { useTeamMetrics } from '../hooks/useSupervisor';
import MessageInbox from '../components/MessageInbox';
import MessageThread from '../components/MessageThread';
import ChatComposer from '../components/ChatComposer';
import TeamRosterPicker from '../components/TeamRosterPicker';

export default function SupervisorMessagesPage() {
  const { connectionState } = useRealtimeConnection();
  const { user } = useAuth();
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [showBroadcastComposer, setShowBroadcastComposer] = useState(false);
  const [showRosterPicker, setShowRosterPicker] = useState(false);

  const { data: inbox, isLoading: inboxLoading, error: inboxError } = useInbox();
  const { data: threadData, isLoading: threadLoading } = useThread(selectedPartnerId || '');
  const { data: teamMetrics, isLoading: teamMetricsLoading, isError: teamMetricsError } = useTeamMetrics(
    showRosterPicker || !!selectedPartnerId,
  );
  const sendMessage = useSendMessage();
  const sendBroadcastMutation = useSendBroadcast();
  const markThreadAsRead = useMarkThreadAsRead();

  // Register realtime event listener
  useMessageRealtime();

  // Build set of partner IDs that already have inbox threads (for dedup marking)
  const existingThreadPartnerIds = useMemo(() => {
    const ids = new Set<string>();
    if (inbox) {
      for (const thread of inbox) {
        ids.add(thread.partnerId);
      }
    }
    return ids;
  }, [inbox]);

  const handleSelectThread = useCallback((partnerId: string) => {
    setSelectedPartnerId(partnerId);
    setShowBroadcastComposer(false);
    setShowRosterPicker(false);
  }, []);

  const handleSelectFromRoster = useCallback((enumeratorId: string) => {
    // AC #2 & #3: Set selectedPartnerId — if existing thread, navigates to it; if new, opens composer
    setSelectedPartnerId(enumeratorId);
    setShowRosterPicker(false);
    setShowBroadcastComposer(false);
  }, []);

  const handleSendMessage = useCallback((content: string) => {
    if (!selectedPartnerId) return;
    sendMessage.mutate({ recipientId: selectedPartnerId, content });
  }, [selectedPartnerId, sendMessage]);

  const handleSendBroadcast = useCallback((content: string) => {
    sendBroadcastMutation.mutate(content, {
      onSuccess: () => setShowBroadcastComposer(false),
    });
  }, [sendBroadcastMutation]);

  const handleMarkThreadAsRead = useCallback((partnerId: string) => {
    markThreadAsRead.mutate(partnerId);
  }, [markThreadAsRead]);

  const handleBack = useCallback(() => {
    setSelectedPartnerId(null);
    setShowBroadcastComposer(false);
    setShowRosterPicker(false);
  }, []);

  const currentUserId = user?.id || '';

  // Loading state
  if (inboxLoading) {
    return (
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-brand font-semibold text-neutral-900">Messages</h1>
            <p className="text-neutral-600 mt-1">Communicate with your team</p>
          </div>
          <RealtimeStatusBanner connectionState={connectionState} />
        </div>
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden" aria-busy="true" aria-label="Loading messages">
          {/* Inbox-list shaped skeleton: rows with avatar + text + timestamp */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 border-b">
              <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-3 w-12 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (inboxError) {
    return (
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-brand font-semibold text-neutral-900">Messages</h1>
            <p className="text-neutral-600 mt-1">Communicate with your team</p>
          </div>
          <RealtimeStatusBanner connectionState={connectionState} />
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="h-12 w-12 text-red-300 mb-3" />
          <p className="text-sm text-red-500">Failed to load messages. Please try again.</p>
        </div>
      </div>
    );
  }

  const threads = inbox || [];
  const showThread = selectedPartnerId || showBroadcastComposer;

  return (
    <div className="p-6 h-full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-brand font-semibold text-neutral-900">Messages</h1>
          <p className="text-neutral-600 mt-1">Communicate with your team</p>
        </div>
        <RealtimeStatusBanner connectionState={connectionState} />
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
        <div className="flex h-full">
          {/* Inbox panel - hidden on mobile when thread is open */}
          <div className={`w-full md:w-80 md:border-r flex-shrink-0 ${showThread ? 'hidden md:block' : ''}`}>
            {showRosterPicker ? (
              <TeamRosterPicker
                enumerators={teamMetrics?.enumerators || []}
                isLoading={teamMetricsLoading}
                isError={teamMetricsError}
                existingThreadPartnerIds={existingThreadPartnerIds}
                onSelectEnumerator={handleSelectFromRoster}
                onClose={() => setShowRosterPicker(false)}
              />
            ) : (
              <MessageInbox
                threads={threads}
                selectedPartnerId={selectedPartnerId}
                onSelectThread={handleSelectThread}
                showBroadcastButton
                onBroadcast={() => { setShowBroadcastComposer(true); setSelectedPartnerId(null); }}
                onNewConversation={() => setShowRosterPicker(true)}
              />
            )}
          </div>

          {/* Thread panel */}
          <div className={`flex-1 flex flex-col ${!showThread ? 'hidden md:flex' : 'flex'}`}>
            {showBroadcastComposer ? (
              <>
                <div className="px-4 py-3 border-b flex items-center gap-3">
                  <button
                    onClick={handleBack}
                    className="md:hidden p-1 hover:bg-gray-100 rounded"
                    aria-label="Back to inbox"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <h2 className="font-medium text-sm">Broadcast to Team</h2>
                </div>
                <div className="flex-1 flex items-center justify-center text-center px-4">
                  <div>
                    <MessageSquare className="h-12 w-12 text-blue-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 mb-1">Send a message to all your assigned enumerators</p>
                    <p className="text-xs text-gray-400">Everyone on your team will receive this message</p>
                  </div>
                </div>
                <ChatComposer
                  onSend={handleSendBroadcast}
                  isSending={sendBroadcastMutation.isPending}
                  placeholder="Type a broadcast message..."
                />
              </>
            ) : selectedPartnerId ? (
              <>
                <div className="px-4 py-3 border-b flex items-center gap-3">
                  <button
                    onClick={handleBack}
                    className="md:hidden p-1 hover:bg-gray-100 rounded"
                    aria-label="Back to inbox"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <h2 className="font-medium text-sm">
                    {threads.find((t) => t.partnerId === selectedPartnerId)?.partnerName
                      || teamMetrics?.enumerators.find((e) => e.id === selectedPartnerId)?.fullName
                      || 'Conversation'}
                  </h2>
                </div>
                {threadLoading ? (
                  <div className="flex-1 p-4 space-y-3" aria-busy="true" aria-label="Loading thread">
                    {/* Message-bubble shaped skeletons: alternating left/right */}
                    <div className="flex justify-start"><Skeleton className="h-12 w-48 rounded-lg" /></div>
                    <div className="flex justify-end"><Skeleton className="h-12 w-56 rounded-lg" /></div>
                    <div className="flex justify-start"><Skeleton className="h-12 w-40 rounded-lg" /></div>
                    <div className="flex justify-end"><Skeleton className="h-16 w-52 rounded-lg" /></div>
                  </div>
                ) : (
                  <MessageThread
                    messages={threadData?.messages || []}
                    currentUserId={currentUserId}
                    onMarkThreadAsRead={handleMarkThreadAsRead}
                    partnerId={selectedPartnerId}
                  />
                )}
                <ChatComposer
                  onSend={handleSendMessage}
                  isSending={sendMessage.isPending}
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center">
                <div>
                  <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Select a conversation or broadcast to your team</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
