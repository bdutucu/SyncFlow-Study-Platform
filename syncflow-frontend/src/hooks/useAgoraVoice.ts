import { useCallback, useEffect, useRef, useState } from 'react';
import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import { api, errorMessage } from '../lib/api';
import type { VoiceToken } from '../lib/types';

export type VoiceStatus =
  | 'idle'         // not connected
  | 'joining'      // fetching token / connecting
  | 'live'         // joined, mic published
  | 'leaving'
  | 'error';

export interface RemoteSpeaker {
  agoraUid: number;
  isSpeaking: boolean;
  /** Last reported volume 0..100 (Agora's scale). */
  level: number;
}

interface UseAgoraVoiceResult {
  status: VoiceStatus;
  error: string | null;
  muted: boolean;
  /** Map keyed by Agora UID. Local user is NOT included. */
  remotes: Map<number, RemoteSpeaker>;
  /** Last local mic level 0..100. 0 when muted. */
  localLevel: number;
  ownAgoraUid: number | null;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => void;
}

/**
 * useAgoraVoice — owns one Agora RTC client + microphone track per room.
 *
 * Lifecycle:
 *   • join() fetches a server-issued RTC token bound to (roomId, user),
 *     creates a microphone track, joins the channel, and publishes.
 *   • Remote `user-published` events subscribe + auto-play their audio.
 *   • `volume-indicator` (1000 ms cadence, 3-level smoothing) feeds the
 *     "who's speaking" UI.
 *   • leave() unpublishes, stops the track, leaves the channel, and
 *     releases resources.
 *
 * Mute is a local-only state — we keep the track published but flip
 * setMuted(true). This is faster than republishing and matches the
 * UX users expect from Discord / Meet.
 */
export function useAgoraVoice(roomId: string): UseAgoraVoiceResult {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [remotes, setRemotes] = useState<Map<number, RemoteSpeaker>>(new Map());
  const [localLevel, setLocalLevel] = useState(0);
  const [ownAgoraUid, setOwnAgoraUid] = useState<number | null>(null);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micRef = useRef<IMicrophoneAudioTrack | null>(null);

  /** Lazy client construction so we don't allocate until the user opts in. */
  const ensureClient = () => {
    if (clientRef.current) return clientRef.current;
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    client.on('user-published', async (user, mediaType) => {
      if (mediaType !== 'audio') return;
      await client.subscribe(user, mediaType);
      user.audioTrack?.play();
      setRemotes((prev) => {
        const next = new Map(prev);
        next.set(Number(user.uid), {
          agoraUid: Number(user.uid),
          isSpeaking: false,
          level: 0,
        });
        return next;
      });
    });

    client.on('user-unpublished', (user) => {
      // Track went away but the user might still be in the channel.
      setRemotes((prev) => {
        const next = new Map(prev);
        const r = next.get(Number(user.uid));
        if (r) next.set(Number(user.uid), { ...r, isSpeaking: false, level: 0 });
        return next;
      });
    });

    client.on('user-left', (user: IAgoraRTCRemoteUser) => {
      setRemotes((prev) => {
        const next = new Map(prev);
        next.delete(Number(user.uid));
        return next;
      });
    });

    client.on('volume-indicator', (volumes) => {
      setRemotes((prev) => {
        const next = new Map(prev);
        for (const v of volumes) {
          const uid = Number(v.uid);
          if (uid === 0 || uid === ownAgoraUid) continue; // 0 = local in some flows
          const existing = next.get(uid);
          if (existing) {
            next.set(uid, {
              ...existing,
              level: v.level,
              isSpeaking: v.level > 5,
            });
          }
        }
        return next;
      });
      // Local level (uid=0 is the convention Agora uses for the local user
      // inside this callback).
      const local = volumes.find((v) => Number(v.uid) === 0);
      if (local) setLocalLevel(local.level);
    });
    AgoraRTC.setLogLevel(3); // warn+ only
    return client;
  };

  const join = useCallback(async () => {
    if (status === 'joining' || status === 'live') return;
    setStatus('joining');
    setError(null);

    try {
      const { data } = await api.post<VoiceToken>(
        `/voice/rooms/${roomId}/token`,
      );

      if (!data.appId) {
        throw new Error('Agora is not configured on the server (AGORA_APP_ID missing).');
      }

      const client = ensureClient();
      await client.join(data.appId, data.channel, data.token, data.uid);
      setOwnAgoraUid(data.uid);

      const mic = await AgoraRTC.createMicrophoneAudioTrack();
      micRef.current = mic;
      await client.publish([mic]);
      client.enableAudioVolumeIndicator();

      setStatus('live');
    } catch (e) {
      setError(errorMessage(e));
      setStatus('error');
      // Best-effort cleanup on partial failure.
      if (micRef.current) {
        micRef.current.close();
        micRef.current = null;
      }
      if (clientRef.current && clientRef.current.connectionState !== 'DISCONNECTED') {
        try { await clientRef.current.leave(); } catch { /* ignore */ }
      }
      setOwnAgoraUid(null);
    }
  }, [roomId, status]);

  const leave = useCallback(async () => {
    if (status === 'idle' || status === 'leaving') return;
    setStatus('leaving');
    try {
      if (micRef.current) {
        try { await clientRef.current?.unpublish([micRef.current]); } catch { /* ignore */ }
        micRef.current.stop();
        micRef.current.close();
        micRef.current = null;
      }
      if (clientRef.current) {
        try { await clientRef.current.leave(); } catch { /* ignore */ }
      }
    } finally {
      setRemotes(new Map());
      setLocalLevel(0);
      setOwnAgoraUid(null);
      setMuted(false);
      setStatus('idle');
    }
  }, [status]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    void micRef.current?.setMuted(next);
    if (next) setLocalLevel(0);
  }, [muted]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      void (async () => {
        if (micRef.current) {
          micRef.current.stop();
          micRef.current.close();
          micRef.current = null;
        }
        if (clientRef.current) {
          try { await clientRef.current.leave(); } catch { /* ignore */ }
          clientRef.current.removeAllListeners();
          clientRef.current = null;
        }
      })();
    };
  }, []);

  return {
    status, error, muted, remotes, localLevel, ownAgoraUid,
    join, leave, toggleMute,
  };
}
