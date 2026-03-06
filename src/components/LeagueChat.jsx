import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Smile } from 'lucide-react';
import { useChatMessages } from '../useChatMessages';
import { getUserDisplayName } from '../utils/userDisplay';

// Common emoji for quick-pick palette — no external library needed
const EMOJI_LIST = [
  '😂','😭','🔥','💀','🏆','👏','😤','🎉','👀','💯',
  '🥶','😮','🤣','❤️','✅','🙏','😍','👍','💪','🤔',
  '😅','🫡','🤯','🙌','⚡','🎯','🥇','💸','👎','😬',
  '🤦','🫠','😎','🥹','😡','🤩','😴','💤','🫶','🏅',
  '⚽','🏈','🏀','⚾','🎾','🏒','🏎️','⛳','🎱','🃏',
];

// Derive initials from a cached user_name string (not a full user object)
const getNameInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

// Returns a deterministic bg color for an avatar based on the email string
const AVATAR_COLORS = [
  'bg-blue-600', 'bg-purple-600', 'bg-emerald-600', 'bg-orange-600',
  'bg-pink-600', 'bg-cyan-600', 'bg-amber-600', 'bg-red-600',
];
const getAvatarColor = (email) => {
  let hash = 0;
  for (let i = 0; i < (email || '').length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) & 0xffff;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const formatRelativeTime = (isoString) => {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export default function LeagueChat({ leagueId, currentUser, isOpen, onOpen, onClose }) {
  const displayName = getUserDisplayName(currentUser);
  const { messages, loading, unreadCount, sendMessage, clearUnread } = useChatMessages(
    leagueId,
    currentUser?.email,
    isOpen
  );

  const [inputText, setInputText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [sendError, setSendError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive or panel opens
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isOpen]);

  // Clear unread + focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      clearUnread();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, clearUnread]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || text.length > 500) return;
    setInputText('');
    setShowEmoji(false);
    setSendError(null);
    const { error } = await sendMessage(text, displayName);
    if (error) setSendError('Failed to send. Try again.');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      if (showEmoji) { setShowEmoji(false); return; }
      onClose();
    }
  };

  const appendEmoji = (emoji) => {
    setInputText((t) => t + emoji);
    inputRef.current?.focus();
  };

  const overLimit = inputText.length > 500;

  return (
    <>
      {/* Floating chat button */}
      <button
        onClick={isOpen ? onClose : onOpen}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 transition-all flex items-center justify-center text-2xl"
        title="League Chat"
      >
        <span>💬</span>
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-green-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1 shadow">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-1.5rem)] flex flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">💬</span>
              <span className="font-semibold text-white text-sm">League Chat</span>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[280px] max-h-[380px]">
            {loading && (
              <div className="flex items-center justify-center h-full">
                <span className="text-slate-500 text-sm">Loading messages…</span>
              </div>
            )}
            {!loading && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
                <span className="text-3xl">💬</span>
                <p className="text-slate-500 text-sm text-center">No messages yet.<br/>Say something to your league!</p>
              </div>
            )}
            {messages.map((msg) => {
              const isMe = msg.user_email?.toLowerCase() === currentUser?.email?.toLowerCase();
              const initials = getNameInitials(msg.user_name);
              const avatarColor = getAvatarColor(msg.user_email);
              return (
                <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold`}>
                    {initials}
                  </div>
                  {/* Bubble */}
                  <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`flex items-baseline gap-1.5 mb-0.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      <span className="text-xs font-medium text-slate-300 truncate max-w-[100px]">
                        {isMe ? 'You' : msg.user_name}
                      </span>
                      <span className="text-xs text-slate-600 flex-shrink-0">
                        {formatRelativeTime(msg.created_at)}
                      </span>
                    </div>
                    <div className={`px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
                      isMe
                        ? 'bg-blue-600/80 text-white rounded-tr-sm'
                        : 'bg-slate-700 text-slate-100 rounded-tl-sm'
                    }`}>
                      {msg.message}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Emoji palette (above input) */}
          {showEmoji && (
            <div className="border-t border-slate-700 px-3 py-2 bg-slate-850">
              <div className="grid grid-cols-10 gap-0.5">
                {EMOJI_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => appendEmoji(emoji)}
                    className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-700 rounded transition-colors"
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-slate-700 px-3 py-2.5 bg-slate-800 flex-shrink-0">
            {sendError && (
              <p className="text-red-400 text-xs mb-1.5">{sendError}</p>
            )}
            <div className="flex items-end gap-2">
              <button
                onClick={() => setShowEmoji((v) => !v)}
                className={`flex-shrink-0 mb-0.5 transition-colors ${showEmoji ? 'text-yellow-400' : 'text-slate-400 hover:text-slate-200'}`}
                title="Emoji"
              >
                <Smile size={18} />
              </button>
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={(e) => { setInputText(e.target.value); setSendError(null); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Message your league…"
                  rows={1}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none leading-snug"
                  style={{ maxHeight: '80px', overflowY: 'auto' }}
                />
                {overLimit && (
                  <span className="absolute bottom-1.5 right-2 text-xs text-red-400">{inputText.length}/500</span>
                )}
              </div>
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || overLimit}
                className="flex-shrink-0 mb-0.5 w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white flex items-center justify-center transition-colors"
                title="Send (Enter)"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
