// useDraftQueue.js
// Manages a user's personal draft queue and personal draft settings for a league.
//
// Queue: an ordered list of sport+team combinations the user wants to draft.
//   - Timer-expiry autopick uses this order before falling back to highest-EP.
//   - Immediate autopick behavior depends on user setting (queue-only or queue+EP).
//   - Teams already picked by anyone are skipped automatically during autopick.
//
// Settings (per user per league):
//   autoPickFromQueue — immediately pick from queue only when it's the user's turn
//   autoPickGeneral   — immediately pick from queue, then EP fallback when it's the user's turn

import { useState, useEffect, useCallback } from 'react';
import {
  getDraftQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  clearQueue,
  getMemberSettings,
  upsertMemberSettings,
} from './supabaseClient';

export function useDraftQueue(leagueId, userEmail) {
  const [queue, setQueue] = useState([]);   // sorted by position ascending
  const [settings, setSettings] = useState({ autoPickFromQueue: false, autoPickGeneral: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!leagueId || !userEmail) return;
    setLoading(true);
    const [{ data: qData }, { data: sData }] = await Promise.all([
      getDraftQueue(leagueId, userEmail),
      getMemberSettings(leagueId, userEmail),
    ]);
    setQueue(qData || []);
    if (sData) {
      const autoPickGeneral = !!sData.auto_pick_general;
      const autoPickFromQueue = !!sData.auto_pick_from_queue;
      setSettings({
        autoPickFromQueue: autoPickGeneral ? false : autoPickFromQueue,
        autoPickGeneral,
      });
    }
    setLoading(false);
  }, [leagueId, userEmail]);

  useEffect(() => { load(); }, [load]);

  // Clear stale error when context changes (e.g. navigating to a different league/user)
  useEffect(() => { setError(null); }, [leagueId, userEmail]);

  // Append a team to the end of the queue.
  // Silently ignores if the team is already queued (DB unique constraint guards this too).
  // Pessimistic: waits for DB before updating UI (addItem creates a new row and needs the returned id).
  const addItem = async (sport, team) => {
    setError(null);
    const alreadyQueued = queue.some(q => q.sport === sport && q.team === team);
    if (alreadyQueued) return;
    const maxPos = queue.length > 0 ? Math.max(...queue.map(q => q.position)) : 0;
    const { data, error: dbError } = await addToQueue(leagueId, userEmail, sport, team, maxPos + 1);
    if (dbError) { console.error('Failed to add to queue:', dbError); setError(dbError); return; }
    if (data) setQueue(prev => [...prev, data]);
  };

  // Remove a queue item by its DB id.
  const removeItem = async (itemId) => {
    setError(null);
    const prevQueue = queue;
    setQueue(prev => prev.filter(q => q.id !== itemId));
    const { error: dbError } = await removeFromQueue(itemId);
    if (dbError) { console.error('Failed to remove queue item, rolling back:', dbError); setQueue(prevQueue); setError(dbError); }
  };

  // Move a queue item up or down by swapping positions with the adjacent item.
  const moveItem = async (itemId, direction) => {
    setError(null);
    const idx = queue.findIndex(q => q.id === itemId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= queue.length) return;

    const prevQueue = queue.map(item => ({ ...item }));
    const updated = [...queue];
    const tmpPos = updated[idx].position;
    updated[idx] = { ...updated[idx], position: updated[swapIdx].position };
    updated[swapIdx] = { ...updated[swapIdx], position: tmpPos };
    updated.sort((a, b) => a.position - b.position);
    setQueue(updated);

    const { error: dbError } = await reorderQueue([
      { id: updated[idx].id, position: updated[idx].position },
      { id: updated[swapIdx].id, position: updated[swapIdx].position },
    ]);
    if (dbError) { console.error('Failed to reorder queue, rolling back:', dbError); setQueue(prevQueue); setError(dbError); }
  };

  // Remove all queue items for this user/league.
  const clearAll = async () => {
    setError(null);
    const prevQueue = queue;
    setQueue([]);
    const { error: dbError } = await clearQueue(leagueId, userEmail);
    if (dbError) {
      console.error('Failed to clear queue, rolling back:', dbError);
      setQueue(prevQueue);
      setError(dbError);
    }
  };

  // Reorder the entire queue at once (used by drag-and-drop).
  // Accepts the new ordered array of queue items (same objects, different order).
  // Optimistic: updates state immediately, rolls back if any DB update fails.
  const reorderAll = async (reorderedItems) => {
    setError(null);
    const prevQueue = queue;
    // Assign new sequential positions
    const withPositions = reorderedItems.map((item, i) => ({ ...item, position: i + 1 }));
    setQueue(withPositions); // optimistic
    const { error: dbError } = await reorderQueue(
      withPositions.map(({ id, position }) => ({ id, position }))
    );
    if (dbError) {
      console.error('Failed to reorder queue, rolling back:', dbError);
      setQueue(prevQueue);
      setError(dbError);
    }
  };

  // Persist personal settings changes.
  const updateSettings = async (newSettings) => {
    setError(null);
    const prevSettings = settings;
    const merged = { ...settings, ...newSettings };
    if (newSettings?.autoPickFromQueue === true) {
      merged.autoPickGeneral = false;
    } else if (newSettings?.autoPickGeneral === true) {
      merged.autoPickFromQueue = false;
    }
    setSettings(merged);
    const { error: dbError } = await upsertMemberSettings(leagueId, userEmail, {
      auto_pick_from_queue: merged.autoPickFromQueue,
      auto_pick_general: merged.autoPickGeneral,
    });
    if (dbError) { console.error('Failed to save settings, rolling back:', dbError); setSettings(prevSettings); setError(dbError); }
  };

  return {
    queue,
    settings,
    loading,
    error,
    addItem,
    removeItem,
    moveItem,
    reorderAll,
    clearAll,
    updateSettings,
    reload: load,
  };
}
