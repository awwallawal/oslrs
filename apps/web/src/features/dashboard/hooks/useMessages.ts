import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  fetchInbox,
  fetchThread,
  fetchUnreadCount,
  sendDirectMessage,
  sendBroadcast,
  markMessageAsRead,
  markThreadAsRead,
} from '../api/message.api';
import { useRealtimeConnection } from '../../../hooks/useRealtimeConnection';

export const messageKeys = {
  all: ['messages'] as const,
  inbox: () => [...messageKeys.all, 'inbox'] as const,
  thread: (userId: string) => [...messageKeys.all, 'thread', userId] as const,
  unreadCount: () => [...messageKeys.all, 'unreadCount'] as const,
};

export function useInbox() {
  const { pollingInterval } = useRealtimeConnection();

  return useQuery({
    queryKey: messageKeys.inbox(),
    queryFn: fetchInbox,
    staleTime: 10_000,
    refetchInterval: pollingInterval,
  });
}

export function useThread(userId: string) {
  const { pollingInterval } = useRealtimeConnection();

  return useQuery({
    queryKey: messageKeys.thread(userId),
    queryFn: () => fetchThread(userId),
    staleTime: 5_000,
    refetchInterval: pollingInterval,
    enabled: !!userId,
  });
}

export function useUnreadCount(enabled = true) {
  const { pollingInterval } = useRealtimeConnection();

  return useQuery({
    queryKey: messageKeys.unreadCount(),
    queryFn: fetchUnreadCount,
    staleTime: 10_000,
    refetchInterval: enabled ? pollingInterval : false,
    enabled,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recipientId, content }: { recipientId: string; content: string }) =>
      sendDirectMessage(recipientId, content),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messageKeys.inbox() });
      queryClient.invalidateQueries({ queryKey: messageKeys.thread(variables.recipientId) });
    },
  });
}

export function useSendBroadcast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => sendBroadcast(content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.inbox() });
    },
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => markMessageAsRead(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });
}

export function useMarkThreadAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => markThreadAsRead(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });
}

/**
 * Hook to listen for realtime message events and invalidate relevant queries.
 */
export function useMessageRealtime() {
  const queryClient = useQueryClient();
  const { socket } = useRealtimeConnection();

  useEffect(() => {
    if (!socket) return;

    const handler = (data: { id: string; senderId: string; messageType: string }) => {
      queryClient.invalidateQueries({ queryKey: messageKeys.inbox() });
      queryClient.invalidateQueries({ queryKey: messageKeys.unreadCount() });
      if (data.senderId) {
        queryClient.invalidateQueries({ queryKey: messageKeys.thread(data.senderId) });
      }
    };

    socket.on('message:received', handler);

    return () => {
      socket.off('message:received', handler);
    };
  }, [socket, queryClient]);
}
