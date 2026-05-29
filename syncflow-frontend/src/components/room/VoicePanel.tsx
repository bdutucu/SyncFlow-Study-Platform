import { useEffect, useMemo, useState } from 'react';
import type { MemberDTO } from '../../lib/types';
import { deriveAgoraUid } from '../../lib/agora-uid';
import { useAgoraVoice } from '../../hooks/useAgoraVoice';

interface Props {
  roomId: string;
  members: MemberDTO[];
  selfUserId: string;
}

/**
 * VoicePanel — Agora-backed voice chat tile for a room.
 *
 * Visual model:
 *   • Idle: a single "Join voice" CTA + brief explainer.
 *   • Live: Mute / Leave controls, plus the room registry annotated
 *     with a sienna pulse next to anyone currently speaking.
 *
 * We map between Agora's numeric UIDs and our user records by
 * computing the same SHA-256 derivation on the client. The map is
 * recomputed any time the member list changes.
 */
export function VoicePanel({ roomId, members, selfUserId }: Props) {
  const voice = useAgoraVoice(roomId);
  const [uidByUser, setUidByUser] = useState<Map<string, number>>(new Map());

  // Async hash all current members → Agora UID.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = new Map<string, number>();
      await Promise.all(
        members.map(async (member) => {
          m.set(member.userId, await deriveAgoraUid(member.userId));
        }),
      );
      if (!cancelled) setUidByUser(m);
    })();
    return () => { cancelled = true; };
  }, [members]);

  const userByUid = useMemo(() => {
    const inverse = new Map<number, MemberDTO>();
    for (const member of members) {
      const uid = uidByUser.get(member.userId);
      if (uid !== undefined) inverse.set(uid, member);
    }
    return inverse;
  }, [members, uidByUser]);

  const inVoice = voice.status === 'live';

  // Build the display list: only members who are actively in voice
  // (i.e. their UID showed up via Agora) + ourselves when we're live.
  const speakerRows = members
    .map((member) => {
      const uid = uidByUser.get(member.userId);
      const isSelf = member.userId === selfUserId;
      const inChannel =
        isSelf
          ? inVoice
          : uid !== undefined && voice.remotes.has(uid);
      const speaking =
        isSelf
          ? inVoice && !voice.muted && voice.localLevel > 5
          : uid !== undefined && (voice.remotes.get(uid)?.isSpeaking ?? false);
      return { member, isSelf, inChannel, speaking };
    })
    .filter((r) => r.inChannel);

  return (
    <div className="card-paper p-5">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="eyebrow">§ Voice</div>
          <div className="font-display text-lg leading-none mt-0.5">Voices in the hall</div>
        </div>
        <span className={
          'font-mono text-[10px] tabular ' +
          (inVoice ? 'text-rest' : 'text-ink-muted')
        }>
          {voice.status}
        </span>
      </div>

      {/* Status / controls */}
      {voice.status === 'idle' && (
        <button
          onClick={() => void voice.join()}
          className="btn-rest w-full"
        >
          ▶ Join voice
        </button>
      )}

      {voice.status === 'joining' && (
        <div className="font-italic italic text-ink-muted text-sm py-2">
          Connecting to the room…
        </div>
      )}

      {voice.status === 'leaving' && (
        <div className="font-italic italic text-ink-muted text-sm py-2">
          Hanging up…
        </div>
      )}

      {voice.status === 'live' && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={voice.toggleMute}
            className={voice.muted ? 'btn-focus btn-sm' : 'btn-ghost btn-sm'}
          >
            {voice.muted ? '🔇 muted' : '🎙 mute'}
          </button>
          <button onClick={() => void voice.leave()} className="btn-ghost btn-sm">
            leave voice
          </button>
        </div>
      )}

      {voice.error && (
        <div className="mt-3 border-l-2 border-focus pl-3 py-1 text-sm text-focus-deep font-italic italic">
          {voice.error}
        </div>
      )}

      {/* Live speakers */}
      {speakerRows.length > 0 && (
        <ul className="mt-4 space-y-1.5 pt-3 border-t border-ink/15">
          {speakerRows.map(({ member, isSelf, speaking }) => (
            <li key={member.userId} className="flex items-center gap-2.5 text-sm">
              <span
                className={
                  'inline-block w-1.5 h-1.5 rounded-full transition-colors ' +
                  (speaking ? 'bg-rest animate-pulse-slow' : 'bg-ink/25')
                }
              />
              <span className={isSelf ? 'text-focus font-display' : 'text-ink font-display'}>
                {member.username}
                {isSelf && <span className="text-ink-muted font-italic italic font-normal text-xs"> · you</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {voice.status === 'idle' && (
        <p className="mt-3 text-xs font-italic italic text-ink-muted">
          Audio runs through Agora — your microphone never touches our servers.
        </p>
      )}
    </div>
  );
}
