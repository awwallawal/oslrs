import { MessageSquare, Radio, PenSquare } from 'lucide-react';
import type { InboxThread } from '../api/message.api';
import { formatRelativeTime } from '../../../lib/utils';

interface MessageInboxProps {
  threads: InboxThread[];
  selectedPartnerId: string | null;
  onSelectThread: (partnerId: string) => void;
  onBroadcast?: () => void;
  showBroadcastButton?: boolean;
  onNewConversation?: () => void;
}

export default function MessageInbox({
  threads,
  selectedPartnerId,
  onSelectThread,
  onBroadcast,
  showBroadcastButton = false,
  onNewConversation,
}: MessageInboxProps) {
  return (
    <div className="flex flex-col h-full">
      {(showBroadcastButton || onNewConversation) && (
        <div className="p-3 border-b space-y-2">
          {onNewConversation && (
            <button
              onClick={onNewConversation}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
              aria-label="Start a new conversation"
            >
              <PenSquare className="h-4 w-4" />
              New Conversation
            </button>
          )}
          {showBroadcastButton && onBroadcast && (
            <button
              onClick={onBroadcast}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              aria-label="Send broadcast message to all team members"
            >
              <Radio className="h-4 w-4" />
              Broadcast to Team
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto" role="list" aria-label="Message threads">
        {threads.map((thread) => (
          <button
            key={thread.partnerId}
            role="listitem"
            onClick={() => onSelectThread(thread.partnerId)}
            className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors ${
              selectedPartnerId === thread.partnerId ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
            }`}
            aria-label={`Conversation with ${thread.partnerName}${thread.unreadCount > 0 ? `, ${thread.unreadCount} unread` : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                  {thread.partnerName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-sm text-gray-900 truncate">
                      {thread.partnerName}
                    </span>
                    {thread.messageType === 'broadcast' && (
                      <Radio className="h-3 w-3 text-blue-500 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{thread.lastMessage}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-xs text-gray-400">{formatRelativeTime(thread.lastMessageAt)}</span>
                {thread.unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 text-xs font-medium text-white bg-red-500 rounded-full">
                    {thread.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}

        {threads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageSquare className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No messages yet</p>
            {onNewConversation ? (
              <button
                onClick={onNewConversation}
                className="text-xs text-emerald-600 hover:text-emerald-700 mt-1 underline"
                aria-label="Start a new conversation from empty inbox"
              >
                Start a new conversation with your team
              </button>
            ) : (
              <p className="text-xs text-gray-400 mt-1">Start a new conversation with your team</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
