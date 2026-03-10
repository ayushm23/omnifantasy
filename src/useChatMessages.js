// useChatMessages.js
// Manages real-time chat messages for a single league.
//
// Usage:
//   const { messages, loading, unreadCount, sendMessage, clearUnread } = useChatMessages(leagueId, userEmail, isOpen);
//
// - messages    — array of { id, league_id, user_email, user_name, message, created_at }
// - loading     — true during initial fetch
// - unreadCount — messages received while the panel was closed (resets when clearUnread() is called)
// - sendMessage(text) — optimistically appends, persists to DB, rolls back on failure
// - clearUnread() — reset unread badge to 0 (call when chat panel is opened)

import { useState, useEffect, useRef, useCallback } from 'react';
import { getLeagueChat, sendChatMessage, subscribeToLeagueChat, unsubscribe } from './supabaseClient';

export function useChatMessages(leagueId, userEmail, isOpen) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const isOpenRef = useRef(isOpen);

  // Keep ref in sync so the subscription callback always sees current value
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Load history when leagueId changes
  useEffect(() => {
    if (!leagueId) {
      setMessages([]);
      setUnreadCount(0);
      return;
    }
    setLoading(true);
    setUnreadCount(0);
    getLeagueChat(leagueId).then(({ data }) => {
      setMessages(data);
      setLoading(false);
    });
  }, [leagueId]);

  // Real-time subscription
  useEffect(() => {
    if (!leagueId) return;

    const sub = subscribeToLeagueChat(leagueId, (payload) => {
      const newMsg = payload.new;
      if (!newMsg) return;

      setMessages((prev) => {
        // Deduplicate: skip if we already have this id (e.g. optimistic insert)
        const ids = new Set(prev.map((m) => m.id));
        if (ids.has(newMsg.id)) return prev;
        return [...prev, newMsg];
      });

      // Only bump unread if the panel is closed and it's not the current user's own message
      if (!isOpenRef.current && newMsg.user_email !== userEmail) {
        setUnreadCount((c) => c + 1);
      }
    });

    return () => unsubscribe(sub);
  }, [leagueId, userEmail]);

  const sendMessage = useCallback(async (text, displayName) => {
    if (!leagueId || !userEmail || !text.trim()) return;

    // Optimistic insert with a temp id
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      league_id: leagueId,
      user_email: userEmail,
      user_name: displayName || userEmail.split('@')[0],
      message: text.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    const { data, error } = await sendChatMessage(
      leagueId,
      userEmail,
      displayName || userEmail.split('@')[0],
      text.trim()
    );

    if (error) {
      // Rollback
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      return { error };
    }

    // Replace optimistic entry with real DB row
    setMessages((prev) =>
      prev.map((m) => (m.id === tempId ? data : m))
    );
    return { error: null };
  }, [leagueId, userEmail]);

  const clearUnread = useCallback(() => setUnreadCount(0), []);

  return { messages, loading, unreadCount, sendMessage, clearUnread };
}
