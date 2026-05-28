import { useEffect, useState } from 'react';

/** Re-renders every `intervalMs` ms — for client-side timer extrapolation. */
export function useRoomTicker(intervalMs = 250): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return tick;
}
