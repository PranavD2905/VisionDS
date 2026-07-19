import { inferPointerRoles, type ExecutionTrace } from '@visionds/trace-schema';
import type { Explanation } from '@visionds/explainer';
import { create } from 'zustand';

interface VisState {
  /** One analyzed trace per testcase; immutable once stored. */
  traces: ExecutionTrace[];
  /** Which testcase's trace is on stage. */
  active: number;
  /** Current step index — the only thing the playback UI mutates. */
  cursor: number;
  playing: boolean;
  speed: number;
  /** AI narration for the active trace; null until requested. */
  explanation: Explanation | null;

  setTraces: (traces: ExecutionTrace[], active: number) => void;
  setExplanation: (explanation: Explanation | null) => void;
  setActive: (index: number) => void;
  seek: (index: number) => void;
  stepBy: (delta: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
}

function clampCursor(state: { traces: ExecutionTrace[]; active: number }, index: number) {
  const steps = state.traces[state.active]?.steps.length ?? 0;
  return Math.min(Math.max(index, 0), Math.max(steps - 1, 0));
}

export const useVis = create<VisState>((set) => ({
  traces: [],
  active: 0,
  cursor: 0,
  playing: false,
  speed: 1,
  explanation: null,

  setTraces: (traces, active) =>
    set({
      traces: traces.map(inferPointerRoles),
      active,
      cursor: 0,
      playing: false,
      explanation: null,
    }),
  setExplanation: (explanation) => set({ explanation }),
  setActive: (index) =>
    set({ active: index, cursor: 0, playing: false, explanation: null }),
  seek: (index) => set((s) => ({ cursor: clampCursor(s, index), playing: false })),
  stepBy: (delta) =>
    set((s) => {
      const next = clampCursor(s, s.cursor + delta);
      // keep playing unless we ran off the end
      return { cursor: next, playing: s.playing && next !== s.cursor ? s.playing : false };
    }),
  setPlaying: (playing) =>
    set((s) => {
      const steps = s.traces[s.active]?.steps.length ?? 0;
      // pressing play at the end restarts
      if (playing && steps > 0 && s.cursor >= steps - 1) return { playing, cursor: 0 };
      return { playing };
    }),
  setSpeed: (speed) => set({ speed }),
}));

export const useActiveTrace = () => useVis((s) => s.traces[s.active]);
