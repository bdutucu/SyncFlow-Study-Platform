import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { connectSocket, emitAck, getSocket } from '../lib/socket';
import { useAuth } from '../lib/auth-store';
import type {
  ChatMessage, MediaState, MemberDTO, RoomDetails, TimerState,
} from '../lib/types';
import { TimerPanel } from '../components/room/TimerPanel';
import { ChatPanel } from '../components/room/ChatPanel';
import { MediaPanel } from '../components/room/MediaPanel';
import { ParticipantList } from '../components/room/ParticipantList';

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const user = useAuth((s) => s.user)!;
  const nav = useNavigate();

  const [room, setRoom] = useState<RoomDetails | null>(null);
  const [members, setMembers] = useState<MemberDTO[]>([]);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [media, setMedia] = useState<MediaState | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [connState, setConnState] = useState<'connecting' | 'live' | 'recovering' | 'lost'>('connecting');
  const [err, setErr] = useState<string | null>(null);

  // Initial fetch + socket subscribe
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    (async () => {
      try {
        const [roomRes, msgRes] = await Promise.all([
          api.get<RoomDetails>(`/rooms/${roomId}`),
          api.get<{ messages: ChatMessage[] }>(`/rooms/${roomId}/messages`, { params: { limit: 50 } }).catch(() => ({ data: { messages: [] } })),
        ]);
        if (cancelled) return;
        setRoom(roomRes.data);
        setMembers(roomRes.data.members);
        setChat(msgRes.data.messages ?? []);
      } catch (e) {
        setErr(errorMessage(e));
        if (!cancelled) setTimeout(() => nav('/lobby'), 1500);
      }
    })();

    const s = connectSocket();

    const onConnect = () => {
      setConnState('live');
      // Subscribe + resync
      emitAck('room:subscribe', roomId).catch((e) => {
        setErr(`subscribe: ${e instanceof Error ? e.message : 'failed'}`);
      });
      emitAck<{ ok: true; state: TimerState }>('timer:get_state', roomId)
        .then((r) => setTimer(r.state))
        .catch(() => {});
      emitAck<{ ok: true; state: MediaState }>('media:get_state', { roomId })
        .then((r) => setMedia(r.state))
        .catch(() => {});
      // Server-supported resync (returns recent chat, timer, media)
      emitAck<{ ok: true; timer?: TimerState; media?: MediaState; messages?: ChatMessage[] }>('room:resync', { roomId })
        .then((r) => {
          if (r.timer) setTimer(r.timer);
          if (r.media) setMedia(r.media);
          if (r.messages) setChat(r.messages);
        })
        .catch(() => { /* server may not support yet — fine, we already hydrated above */ });
    };

    const onDisconnect = () => setConnState('recovering');
    const onReconnect = () => setConnState('live');

    const onTimer = (p: { state: TimerState }) => setTimer(p.state);
    const onMedia = (p: { state: MediaState }) => setMedia(p.state);
    const onJoined = (p: { member: MemberDTO }) => setMembers((m) => (m.some((x) => x.userId === p.member.userId) ? m : [...m, p.member]));
    const onLeft = (p: { userId: string }) => setMembers((m) => m.filter((x) => x.userId !== p.userId));
    const onKicked = (p: { userId: string }) => {
      if (p.userId === user.id) {
        alert('You were removed from this room.');
        nav('/lobby');
      } else {
        setMembers((m) => m.filter((x) => x.userId !== p.userId));
      }
    };
    const onHostChanged = (p: { newHostId: string }) => {
      setRoom((r) => (r ? { ...r, hostId: p.newHostId } : r));
    };
    const onRoomDeleted = () => {
      alert('The host closed the room.');
      nav('/lobby');
    };

    if (s.connected) onConnect();
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.io.on('reconnect', onReconnect);
    s.on('timer:state_changed', onTimer);
    s.on('media:state_changed', onMedia);
    s.on('room:user_joined', onJoined);
    s.on('room:user_left', onLeft);
    s.on('room:user_kicked', onKicked);
    s.on('room:host_changed', onHostChanged);
    s.on('room:room_deleted', onRoomDeleted);

    return () => {
      cancelled = true;
      emitAck('room:unsubscribe', roomId).catch(() => {});
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.io.off('reconnect', onReconnect);
      s.off('timer:state_changed', onTimer);
      s.off('media:state_changed', onMedia);
      s.off('room:user_joined', onJoined);
      s.off('room:user_left', onLeft);
      s.off('room:user_kicked', onKicked);
      s.off('room:host_changed', onHostChanged);
      s.off('room:room_deleted', onRoomDeleted);
    };
  }, [roomId, user.id, nav]);

  const leave = async () => {
    if (!roomId) return;
    try { await api.post(`/rooms/${roomId}/leave`); } catch { /* ignore */ }
    nav('/lobby');
  };

  const kick = async (userId: string) => {
    if (!roomId) return;
    if (!confirm('Remove this participant?')) return;
    try { await api.delete(`/rooms/${roomId}/members/${userId}`); }
    catch (e) { setErr(errorMessage(e)); }
  };

  if (err && !room) {
    return <div className="font-italic italic text-focus-deep">{err}</div>;
  }
  if (!room) {
    return <div className="font-italic italic text-ink-muted">Opening the door…</div>;
  }

  const isHost = room.hostId === user.id;
  const canModerate = isHost || user.role === 'SYSTEM_ADMIN';

  return (
    <div className="max-w-7xl mx-auto">
      {/* Room masthead */}
      <header className="flex flex-wrap items-baseline justify-between gap-4 mb-3">
        <div>
          <div className="flex items-baseline gap-3">
            <span className="eyebrow">Room №{room.id.slice(0, 8)}</span>
            <ConnDot state={connState} />
          </div>
          <h1 className="headline-serif text-4xl sm:text-5xl font-black mt-1">{room.name}</h1>
          {room.description && (
            <p className="font-italic italic text-ink-soft mt-1 max-w-2xl">{room.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CopyBtn value={room.id} />
          <button onClick={leave} className="btn-ghost btn-sm">leave</button>
        </div>
      </header>
      <div className="rule-double mb-8" />

      {err && (
        <div className="mb-4 border-l-2 border-focus pl-3 py-1 text-sm text-focus-deep font-italic italic">{err}</div>
      )}

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* LEFT column: timer + media */}
        <div className="space-y-6">
          <TimerPanel roomId={room.id} state={timer} isHost={isHost} />
          <MediaPanel roomId={room.id} state={media} isHost={isHost} />
        </div>

        {/* RIGHT column: members + chat */}
        <div className="space-y-6">
          <ParticipantList
            members={members}
            selfId={user.id}
            hostId={room.hostId}
            capacity={room.maxParticipants}
            canKick={canModerate}
            onKick={(uid) => void kick(uid)}
          />
          <ChatPanel roomId={room.id} initialMessages={chat} />
        </div>
      </div>
    </div>
  );
}

function ConnDot({ state }: { state: 'connecting' | 'live' | 'recovering' | 'lost' }) {
  const map = {
    connecting: { c: 'bg-ink-muted', t: 'connecting' },
    live:       { c: 'bg-rest',       t: 'live' },
    recovering: { c: 'bg-focus animate-pulse-slow', t: 'reconnecting' },
    lost:       { c: 'bg-focus-deep', t: 'lost' },
  }[state];
  return (
    <span className="flex items-center gap-1.5 eyebrow">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${map.c}`} />
      {map.t}
    </span>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="btn-ghost btn-sm font-mono"
    >
      {done ? '✓ copied' : '⧉ room id'}
    </button>
  );
}
