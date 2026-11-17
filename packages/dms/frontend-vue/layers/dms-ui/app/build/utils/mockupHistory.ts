/**
 * The undo stack of the `/mockup` editor: the states before the present one,
 * the present one, and those an undo stepped back from.
 */
export interface MockupHistory<State> {
  past: State[];
  present: State;
  future: State[];
  /** What the last commit was, so the next one with the same key joins it. */
  coalesceKey?: string;
}

/** How many undo steps the history keeps. */
export const MOCKUP_HISTORY_LIMIT = 100;

/** A history holding `state` alone, nothing to undo or redo. */
export function reset<State>(state: State): MockupHistory<State> {
  return { past: [], present: state, future: [] };
}

/**
 * Makes `state` the present one and drops what could be redone. A commit
 * with the same `coalesceKey` as the one before it (typing in one field)
 * replaces the present instead, so one undo takes the whole run back.
 */
export function commit<State>(
  history: MockupHistory<State>,
  state: State,
  coalesceKey?: string,
): MockupHistory<State> {
  const joins =
    coalesceKey !== undefined && coalesceKey === history.coalesceKey;
  const past = joins
    ? history.past
    : [...history.past, history.present].slice(-MOCKUP_HISTORY_LIMIT);
  return { past, present: state, future: [], coalesceKey };
}

/**
 * The history taken back to `state`, the last one the backend took: every
 * step after it is dropped, so no undo lands on a state that changes
 * nothing, and nothing can be redone.
 */
export function revertTo<State>(
  history: MockupHistory<State>,
  state: State,
): MockupHistory<State> {
  const index = history.past.lastIndexOf(state);
  return {
    past: index === -1 ? history.past : history.past.slice(0, index),
    present: state,
    future: [],
  };
}

/** The history one step back, or the same history when nothing is left to undo. */
export function undo<State>(
  history: MockupHistory<State>,
): MockupHistory<State> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

/** The history one step forward, or the same history when nothing is left to redo. */
export function redo<State>(
  history: MockupHistory<State>,
): MockupHistory<State> {
  const [next, ...future] = history.future;
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future,
  };
}
