import { ref, type Ref } from "vue";

/** What a stubbed `useDmsState` can hold: the JSON-like values the layer keeps. */
export type StateValue = string | number | boolean | object | null | undefined;

/** A stub of `useDmsState` that hands out a new ref on every call. */
export const freshDmsState = (
  _key: string,
  initial: () => StateValue,
): Ref<StateValue> => ref<StateValue>(initial());

/** A stub of `useDmsState` that keeps one ref per key in `states`. */
export const sharedDmsState =
  (states: Map<string, Ref<StateValue>>) =>
  (key: string, initial: () => StateValue): Ref<StateValue> => {
    const known = states.get(key);
    if (known) return known;
    const created = ref<StateValue>(initial());
    states.set(key, created);
    return created;
  };

/** A stub of `useDmsCookie` that keeps one ref per key in `cookies`. */
export const sharedDmsCookie =
  (cookies: Map<string, Ref<StateValue>>) =>
  (key: string, options: { default: () => StateValue }): Ref<StateValue> =>
    sharedDmsState(cookies)(key, options.default);
