/**
 * Tiny Web Audio "chime" — a two-note bell played on every Pomodoro
 * phase transition. We synthesize it rather than ship an audio file so
 * the bundle stays small and we can tweak the timbre per phase.
 *
 * The first call lazily constructs the AudioContext; browsers require a
 * user gesture for that, so the first chime can only succeed after the
 * user has clicked something. In practice the host's "Start" click is
 * enough to unlock it for the entire session.
 */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

interface ChimeOptions {
  /** Hz, root note. */
  freq?: number;
  /** Second note's interval in semitones relative to root. */
  interval?: number;
  /** Peak gain 0..1 — keep low (default 0.18) so we don't startle. */
  gain?: number;
  /** Total length seconds. */
  duration?: number;
}

export function chime(opts: ChimeOptions = {}): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') {
    // Some browsers (Safari, iOS) keep the context suspended until a
    // user gesture — try to resume; if it fails we silently no-op.
    void c.resume();
  }

  const freq = opts.freq ?? 660;
  const interval = opts.interval ?? 7;          // perfect-fifth above
  const gainPeak = opts.gain ?? 0.18;
  const duration = opts.duration ?? 0.75;

  const now = c.currentTime;
  const second = freq * Math.pow(2, interval / 12);

  // Master gain — gentle ADSR-ish envelope.
  const master = c.createGain();
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(gainPeak, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  master.connect(c.destination);

  for (const [f, delay] of [[freq, 0], [second, 0.18]] as const) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    // Each note's own envelope so the second one chimes through.
    const g = c.createGain();
    g.gain.setValueAtTime(0, now + delay);
    g.gain.linearRampToValueAtTime(1, now + delay + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.55);
    osc.connect(g).connect(master);
    osc.start(now + delay);
    osc.stop(now + delay + 0.6);
  }
}

/** Convenience presets for the two transition kinds we care about. */
export const chimes = {
  /** Lower, warmer — break is starting. */
  startBreak: () => chime({ freq: 523.25, interval: 4, gain: 0.18 }),  // C5 + E5 (major third)
  /** Brighter, alert — work is starting. */
  startWork:  () => chime({ freq: 659.25, interval: 7, gain: 0.20 }),  // E5 + B5 (fifth)
};
