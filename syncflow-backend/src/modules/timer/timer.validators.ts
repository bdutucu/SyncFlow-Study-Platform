import { z } from 'zod';

/**
 * Bounds:
 *   - durations: 1 minute .. 4 hours
 *   - cyclesBeforeLongBreak: 1 .. 10
 * The host can tune all of these via `timer:configure`.
 */
const ONE_MINUTE = 60 * 1000;
const FOUR_HOURS = 4 * 60 * 60 * 1000;

export const timerConfigPatchSchema = z
  .object({
    workDurationMs: z.number().int().min(ONE_MINUTE).max(FOUR_HOURS).optional(),
    shortBreakDurationMs: z.number().int().min(ONE_MINUTE).max(FOUR_HOURS).optional(),
    longBreakDurationMs: z.number().int().min(ONE_MINUTE).max(FOUR_HOURS).optional(),
    cyclesBeforeLongBreak: z.number().int().min(1).max(10).optional(),
    autoAdvance: z.boolean().optional(),
  })
  .refine(
    (v) => Object.keys(v).length > 0,
    'At least one field must be provided',
  );

export type TimerConfigPatch = z.infer<typeof timerConfigPatchSchema>;
