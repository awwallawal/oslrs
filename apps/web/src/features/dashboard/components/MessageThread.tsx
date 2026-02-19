import { useEffect, useMemo, useRef } from 'react';
import type { ThreadMessage } from '../api/message.api';

interface MessageThreadProps {
  messages: ThreadMessage[];
  currentUserId: string;
  /** Batch mark all messages from this partner as read (called once on mount/partner change) */
  onMarkThreadAsRead?: (partnerId: string) => void;
  partnerId?: string;
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function MessageThread({
  messages,
  currentUserId,
  onMarkThreadAsRead,
  partnerId,
}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const markedThreadRef = useRef<string | null>(null);

  // API returns DESC (newest first) for cursor pagination.
  // Reverse to chronological order for chat display (oldest top, newest bottom).
  const chronologicalMessages = useMemo(() => [...messages].reverse(), [messages]);

  // Scroll to bottom on new messages (shows newest)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chronologicalMessages.length]);

  // Batch mark thread as read when opened or partner changes
  useEffect(() => {
    if (onMarkThreadAsRead && partnerId && partnerId !== markedThreadRef.current) {
      const hasUnread = chronologicalMessages.some((msg) => msg.senderId !== currentUserId);
      if (hasUnread) {
        markedThreadRef.current = partnerId;
        onMarkThreadAsRead(partnerId);
      }
    }
  }, [partnerId, chronologicalMessages, currentUserId, onMarkThreadAsRead]);

  let lastDate = '';

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2" role="log" aria-label="Message thread">
      {chronologicalMessages.map((msg) => {
        const isSender = msg.senderId === currentUserId;
        const msgDate = formatDateSeparator(msg.sentAt);
        const showDateSeparator = msgDate !== lastDate;
        lastDate = msgDate;

        return (
          <div key={msg.id}>
            {showDateSeparator && (
              <div className="flex justify-center my-3">
                <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                  {msgDate}
                </span>
              </div>
            )}
            <div className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 ${
                  isSender
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {!isSender && (
                  <p className="text-xs font-medium text-gray-600 mb-0.5">
                    {msg.senderName}
                    {msg.messageType === 'broadcast' && (
                      <span className="ml-1 text-blue-500">(broadcast)</span>
                    )}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={`text-xs mt-1 ${isSender ? 'text-blue-100' : 'text-gray-400'}`}>
                  {formatTimestamp(msg.sentAt)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
