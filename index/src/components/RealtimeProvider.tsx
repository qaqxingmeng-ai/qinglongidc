'use client';

import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch, extractApiError } from '@/lib/api-client';
import { buildRealtimeWsUrl } from '@/lib/realtime-client';

export interface RealtimeNotification {
  id: string;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  relatedId?: string;
  relatedType?: string;
  createdAt: string;
}

interface RealtimeContextType {
  connected: boolean;
  unreadCount: number;
  onlineUsers: number;
  lastNotification: RealtimeNotification | null;
  setUnreadCount: Dispatch<SetStateAction<number>>;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [lastNotification, setLastNotification] = useState<RealtimeNotification | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    if (!user) {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setConnected(false);
      setOnlineUsers(0);
      setUnreadCount(0);
      setLastNotification(null);
      reconnectAttemptRef.current = 0;
      return;
    }

    let cancelled = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const syncUnreadCount = async () => {
      try {
        const res = await apiFetch('/api/dashboard/notifications/unread-count', { method: 'GET' });
        const json = await res.json();
        if (json.success) {
          setUnreadCount(json.data?.count ?? json.count ?? 0);
        }
      } catch {
        // ignore
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      clearReconnectTimer();
      const delay = Math.min(30000, 1000 * 2 ** reconnectAttemptRef.current);
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(() => {
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (cancelled) return;

      await syncUnreadCount();

      try {
        const tokenRes = await apiFetch('/api/realtime/token', { method: 'GET' });
        const tokenJson = await tokenRes.json();
        const token = tokenJson.data?.token;
        if (!tokenJson.success || !token) {
          throw new Error(extractApiError(tokenJson.error, 'realtime token unavailable'));
        }

        const socket = new WebSocket(buildRealtimeWsUrl(token));
        socketRef.current = socket;

        socket.onopen = () => {
          if (cancelled) {
            socket.close();
            return;
          }
          reconnectAttemptRef.current = 0;
          setConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'notification' && message.notification) {
              setLastNotification(message.notification);
              if (typeof message.unreadCount === 'number') {
                setUnreadCount(message.unreadCount);
              }
            }
            if (message.type === 'online_users' && typeof message.onlineUsers === 'number') {
              setOnlineUsers(message.onlineUsers);
            }
            if (message.type === 'connected' && typeof message.onlineUsers === 'number') {
              setOnlineUsers(message.onlineUsers);
            }
          } catch {
            // ignore malformed event
          }
        };

        socket.onclose = () => {
          if (socketRef.current === socket) {
            socketRef.current = null;
          }
          setConnected(false);
          if (!cancelled) {
            scheduleReconnect();
          }
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch {
        setConnected(false);
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setConnected(false);
    };
  }, [user]);

  return (
    <RealtimeContext.Provider value={{ connected, unreadCount, onlineUsers, lastNotification, setUnreadCount }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be inside RealtimeProvider');
  return ctx;
}
