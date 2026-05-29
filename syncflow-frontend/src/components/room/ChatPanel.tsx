import { useEffect, useRef, useState } from 'react';
import { getSocket, emitAck } from '../../lib/socket';
import type { ChatMessage } from '../../lib/types';
import { useAuth } from '../../lib/auth-store';

const MAX = 255;

interface Props {
  roomId: string;
  initialMessages: ChatMessage[];
}

export function ChatPanel({ roomId, initialMessages }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const user = useAuth((s) => s.user)!;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset when initial changes (new resync)
  useEffect(() => { setMessages(initialMessages); }, [initialMessages]);

  // Socket subscriptions
  useEffect(() => {
    const s = getSocket();
    const onNew = (p: { message: ChatMessage }) => {
      setMessages((prev) => (prev.some((m) => m.id === p.message.id) ? prev : [...prev, p.message]));
    };
    const onDel = (p: { messageId: string; deletedByUserId: string }) => {
      setMessages((prev) => prev.map((m) => (m.id === p.messageId ? { ...m, isDeleted: true, content: '', deletedByUserId: p.deletedByUserId } : m)));
    };
    s.on('chat:new_message', onNew);
    s.on('chat:message_deleted', onDel);
    return () => {
      s.off('chat:new_message', onNew);
      s.off('chat:message_deleted', onDel);
    };
  }, [roomId]);

  // Auto-scroll bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setSending(true); setErr(null);
    try {
      await emitAck('chat:send_message', { roomId, content });
      setDraft('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card-paper flex flex-col h-[520px] min-w-0">
      <div className="px-5 py-3 border-b border-ink/15 flex items-baseline justify-between">
        <div>
          <div className="eyebrow">§ Chalkboard</div>
          <div className="font-display text-lg leading-none mt-0.5">Whispers in the hall</div>
        </div>
        <span className="font-mono text-[10px] text-ink-muted">{messages.length} msg</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-w-0">
        {messages.length === 0 ? (
          <div className="text-ink-muted font-italic italic text-sm">Silence. Be the first to speak.</div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const showAuthor = !prev || prev.authorId !== m.authorId;
            const isMine = m.authorId === user.id;
            return (
              <div key={m.id} className="text-sm">
                {showAuthor && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className={'font-display text-[15px] ' + (isMine ? 'text-focus' : 'text-ink')}>
                      {m.authorUsername}
                    </span>
                    <span className="font-mono text-[10px] text-ink-muted tabular">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {m.isDeleted ? (
                  <div className="text-ink-muted font-italic italic">— message redacted —</div>
                ) : (
                  <div className="text-ink-soft leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]">{m.content}</div>
                )}
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={send} className="border-t border-ink/15 px-3 py-2 flex items-center gap-2">
        <input
          className="flex-1 bg-transparent px-2 py-2 text-sm focus:outline-none placeholder-ink-muted"
          value={draft}
          maxLength={MAX}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="write something quiet…"
        />
        <span className={'font-mono text-[10px] tabular ' + (draft.length > MAX - 20 ? 'text-focus' : 'text-ink-muted')}>
          {draft.length}/{MAX}
        </span>
        <button disabled={sending || !draft.trim()} className="btn-ink btn-sm disabled:opacity-40">send</button>
      </form>
      {err && <div className="px-4 pb-2 text-xs text-focus-deep font-italic italic">{err}</div>}
    </div>
  );
}
