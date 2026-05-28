import { useState } from 'react';
import type { TimerState } from '../../lib/types';
import { emitAck } from '../../lib/socket';
import { formatMs } from '../../lib/format';
import { useRoomTicker } from '../../hooks/useRoomTicker';

interface Props {
  roomId: string;
  state: TimerState | null;
  isHost: boolean;
}

export function TimerPanel({ roomId, state, isHost }: Props) {
  useRoomTicker(250);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  if (!state) {
    return (
      <div className="card-paper p-10 text-center text-ink-muted font-italic italic">
        Connecting to the clock…
      </div>
    );
  }

  const elapsed = computeElapsed(state);
  const remaining = Math.max(0, state.phaseDurationMs - elapsed);
  const pct = state.phaseDurationMs > 0 ? Math.min(100, (elapsed / state.phaseDurationMs) * 100) : 0;

  const phaseLabel =
    state.phase === 'WORK' ? 'Deep work' :
    state.phase === 'SHORT_BREAK' ? 'Short rest' : 'Long rest';
  const isWork = state.phase === 'WORK';
  const accent = isWork ? 'focus' : 'rest';

  const call = async (event: string) => {
    setBusy(true); setErr(null);
    try { await emitAck(event, roomId); }
    catch (e) { setErr(e instanceof Error ? e.message : 'failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="card-paper p-8 sm:p-10 relative overflow-hidden">
      {/* Phase ticker tape */}
      <div className="flex items-baseline justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <span className={`eyebrow text-${accent}`}>{state.status.toLowerCase()}</span>
          <span className="text-ink-muted">·</span>
          <span className="eyebrow">cycle {state.completedWorkCycles}</span>
        </div>
        <button onClick={() => setShowConfig((s) => !s)} className="eyebrow hover:text-ink">
          {showConfig ? '× close' : '⚙ configure'}
        </button>
      </div>

      {/* Phase label */}
      <div className="font-italic italic text-xl text-ink-soft mb-2">{phaseLabel}</div>

      {/* THE NUMBER */}
      <div className={`font-display tabular leading-none font-black text-[18vw] sm:text-[14vw] lg:text-[11rem] xl:text-[13rem] text-${accent}`}>
        {formatMs(remaining)}
      </div>

      {/* Progress rule */}
      <div className="mt-6 relative h-px bg-ink/15">
        <div
          className={`absolute left-0 top-0 h-px bg-${accent} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-${accent} transition-[left] duration-500`}
          style={{ left: `calc(${pct}% - 4px)` }}
        />
      </div>

      <div className="flex justify-between mt-2 font-mono text-[10px] tracking-widest text-ink-muted tabular">
        <span>{formatMs(elapsed)}</span>
        <span>{formatMs(state.phaseDurationMs)}</span>
      </div>

      {/* Host controls */}
      {isHost ? (
        <div className="mt-8 flex flex-wrap gap-2">
          {state.status === 'IDLE' && (
            <button disabled={busy} onClick={() => void call('timer:start')} className={`btn-${accent}`}>▶ Start</button>
          )}
          {state.status === 'RUNNING' && (
            <button disabled={busy} onClick={() => void call('timer:pause')} className="btn-ghost">⏸ Pause</button>
          )}
          {state.status === 'PAUSED' && (
            <button disabled={busy} onClick={() => void call('timer:resume')} className={`btn-${accent}`}>▶ Resume</button>
          )}
          <button disabled={busy} onClick={() => void call('timer:skip')} className="btn-ghost">⤼ Skip phase</button>
          <button disabled={busy} onClick={() => void call('timer:reset')} className="btn-ghost">↺ Reset</button>
        </div>
      ) : (
        <div className="mt-8 font-italic italic text-ink-muted text-sm">
          The host holds the clock. You're listening in.
        </div>
      )}

      {err && (
        <div className="mt-4 border-l-2 border-focus pl-3 py-1 text-sm text-focus-deep font-italic italic">{err}</div>
      )}

      {showConfig && isHost && (
        <ConfigForm roomId={roomId} state={state} onClose={() => setShowConfig(false)} />
      )}
    </div>
  );
}

function ConfigForm({
  roomId,
  state,
  onClose,
}: {
  roomId: string;
  state: TimerState;
  onClose: () => void;
}) {
  const [work, setWork] = useState(state.config.workDurationMs / 60000);
  const [shortB, setShortB] = useState(state.config.shortBreakDurationMs / 60000);
  const [longB, setLongB] = useState(state.config.longBreakDurationMs / 60000);
  const [cycles, setCycles] = useState(state.config.cyclesBeforeLongBreak);
  const [auto, setAuto] = useState(state.config.autoAdvance);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await emitAck('timer:configure', roomId, {
        workDurationMs: Math.round(work * 60000),
        shortBreakDurationMs: Math.round(shortB * 60000),
        longBreakDurationMs: Math.round(longB * 60000),
        cyclesBeforeLongBreak: cycles,
        autoAdvance: auto,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 pt-6 border-t border-ink/15 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
      <NumField label="Work · min" v={work} set={setWork} min={1} max={120} />
      <NumField label="Short rest · min" v={shortB} set={setShortB} min={1} max={60} />
      <NumField label="Long rest · min" v={longB} set={setLongB} min={1} max={60} />
      <NumField label="Cycles → long" v={cycles} set={setCycles} min={1} max={10} step={1} />
      <label className="flex items-center gap-2 col-span-2 sm:col-span-1 mt-5">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-ink" />
        <span className="text-sm">Auto-advance</span>
      </label>
      {err && <div className="col-span-full text-focus-deep text-sm font-italic italic">{err}</div>}
      <div className="col-span-full flex justify-end gap-2 mt-2">
        <button type="button" onClick={onClose} className="btn-ghost btn-sm">cancel</button>
        <button disabled={busy} type="submit" className="btn-ink btn-sm">save</button>
      </div>
    </form>
  );
}

function NumField({
  label, v, set, min, max, step,
}: { label: string; v: number; set: (n: number) => void; min: number; max: number; step?: number }) {
  return (
    <div>
      <label className="label-num">{label}</label>
      <input type="number" min={min} max={max} step={step ?? 0.5} className="field tabular font-mono" value={v} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );
}

function computeElapsed(s: TimerState): number {
  if (s.status === 'RUNNING' && s.phaseStartedAt !== null) {
    return s.accumulatedMs + (Date.now() - s.phaseStartedAt);
  }
  if (s.status === 'PAUSED') return s.accumulatedMs;
  return 0;
}
