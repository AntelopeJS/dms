import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComputedRef,
} from "vue";
import { GITHUB_REPOSITORY_URL } from "../../utils/github-repository";

const STORAGE_PREFIX = "dms-github-star-prompt:";

/** `localStorage` keys of the star prompt, per browser. */
export const GITHUB_STAR_PROMPT_KEYS = {
  /** Visible time spent on signed-in dashboard pages, in milliseconds. */
  activeMs: `${STORAGE_PREFIX}active-ms`,
  /** Epoch milliseconds until which "Later" keeps the prompt hidden. */
  snoozedUntil: `${STORAGE_PREFIX}snoozed-until`,
  /** Set once the prompt is starred or closed: it never shows again. */
  dismissed: `${STORAGE_PREFIX}dismissed`,
} as const;

/** Active dashboard time before the prompt first shows. */
export const GITHUB_STAR_PROMPT_DELAY_MS = 15 * 60 * 1000;
/** How long "Later" hides the prompt. */
export const GITHUB_STAR_PROMPT_SNOOZE_MS = 48 * 60 * 60 * 1000;
/** How often the visible time is saved and the snooze checked. */
export const GITHUB_STAR_PROMPT_TICK_MS = 30 * 1000;

const DISMISSED = "1";
const VISIBLE = "visible";

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode, quota): the prompt state lasts the page */
  }
}

function readCount(key: string): number {
  const value = Number(readStorage(key));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function isPageVisible(): boolean {
  return document.visibilityState === VISIBLE;
}

export interface GithubStarPrompt {
  /** Whether the prompt is due: enough active time, not snoozed, not dismissed. */
  isDue: ComputedRef<boolean>;
  /** "Later": hides the prompt for {@link GITHUB_STAR_PROMPT_SNOOZE_MS}. */
  snooze: () => void;
  /** Opens the repository in a new tab, then never shows the prompt again. */
  star: () => void;
  /** Never shows the prompt again. */
  dismiss: () => void;
}

/**
 * The GitHub star invitation's timing, kept per browser in `localStorage`.
 * Only the time the tab is visible counts, added up across sessions, so a
 * dashboard left open in a background tab does not bring the prompt sooner.
 * Without `isEnabled` nothing is counted or shown.
 */
export const useGithubStarPrompt = (isEnabled: boolean): GithubStarPrompt => {
  const isMounted = ref(false);
  const activeMs = ref(0);
  const snoozedUntil = ref(0);
  const isDismissed = ref(false);
  const now = ref(0);
  let countedSince: number | null = null;
  let ticker: ReturnType<typeof setInterval> | undefined;

  const isDue = computed(
    () =>
      isMounted.value &&
      !isDismissed.value &&
      activeMs.value >= GITHUB_STAR_PROMPT_DELAY_MS &&
      now.value >= snoozedUntil.value,
  );

  // Merged with what this page holds: a choice made in another tab is
  // followed here, and one made here outlives a storage that cannot be read.
  function load(): void {
    activeMs.value = storedActiveMs();
    snoozedUntil.value = Math.max(
      snoozedUntil.value,
      readCount(GITHUB_STAR_PROMPT_KEYS.snoozedUntil),
    );
    isDismissed.value ||=
      readStorage(GITHUB_STAR_PROMPT_KEYS.dismissed) === DISMISSED;
    now.value = Date.now();
  }

  function storedActiveMs(): number {
    return Math.max(
      activeMs.value,
      readCount(GITHUB_STAR_PROMPT_KEYS.activeMs),
    );
  }

  // Added to the stored total rather than written over it, so two tabs add
  // up. One tick at most is counted per call: a longer gap means the device
  // slept, which is not time spent on the dashboard.
  function count(): void {
    if (countedSince === null) return;
    const at = Date.now();
    const elapsed = Math.min(at - countedSince, GITHUB_STAR_PROMPT_TICK_MS);
    countedSince = at;
    if (activeMs.value >= GITHUB_STAR_PROMPT_DELAY_MS) return;
    activeMs.value = storedActiveMs() + elapsed;
    writeStorage(GITHUB_STAR_PROMPT_KEYS.activeMs, String(activeMs.value));
  }

  function onVisibilityChange(): void {
    count();
    countedSince = isPageVisible() ? Date.now() : null;
  }

  function tick(): void {
    count();
    load();
    if (isDismissed.value) stop();
  }

  function stop(): void {
    clearInterval(ticker);
    ticker = undefined;
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }

  function dismiss(): void {
    isDismissed.value = true;
    writeStorage(GITHUB_STAR_PROMPT_KEYS.dismissed, DISMISSED);
    stop();
  }

  function snooze(): void {
    now.value = Date.now();
    snoozedUntil.value = now.value + GITHUB_STAR_PROMPT_SNOOZE_MS;
    writeStorage(
      GITHUB_STAR_PROMPT_KEYS.snoozedUntil,
      String(snoozedUntil.value),
    );
  }

  function star(): void {
    window.open(GITHUB_REPOSITORY_URL, "_blank", "noopener,noreferrer");
    dismiss();
  }

  onMounted(() => {
    if (!isEnabled) return;
    load();
    isMounted.value = true;
    if (isDismissed.value) return;
    countedSince = isPageVisible() ? Date.now() : null;
    document.addEventListener("visibilitychange", onVisibilityChange);
    ticker = setInterval(tick, GITHUB_STAR_PROMPT_TICK_MS);
  });

  onBeforeUnmount(() => {
    if (ticker === undefined) return;
    count();
    stop();
  });

  return { isDue, snooze, star, dismiss };
};
