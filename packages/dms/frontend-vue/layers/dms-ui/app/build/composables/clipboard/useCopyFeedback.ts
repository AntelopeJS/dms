import { onScopeDispose, ref, type Ref } from "vue";

/** How long a copy button says "Copied" before it offers to copy again. */
const COPIED_FEEDBACK_MS = 1600;
const COPY_ICON = "i-ph-copy";
const COPIED_ICON = "i-ph-check";

/** What `useCopyFeedback` offers a copy button. */
export interface CopyFeedback<Key> {
  /** Copies the text, then marks `key` copied for a while. */
  copyText: (text: string, key: Key) => Promise<void>;
  isCopied: (key: Key) => boolean;
  /** The copy icon, or the check while `key` reads as copied. */
  iconOf: (key: Key) => string;
  /** Forgets the last copy. */
  reset: () => void;
}

/**
 * Copies to the clipboard and remembers, for a moment, what was copied:
 * a list of copy buttons (keyed by what each copies) or a single one.
 *
 * @param feedbackMs How long a copy reads as copied; `Infinity` keeps it
 *   until `reset` (a copy that acknowledges something, such as backup codes)
 */
export function useCopyFeedback<Key = true>(
  feedbackMs: number = COPIED_FEEDBACK_MS,
): CopyFeedback<Key> {
  const copiedKey = ref<Key | null>(null) as Ref<Key | null>;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function reset(): void {
    clearTimeout(timer);
    copiedKey.value = null;
  }

  async function copyText(text: string, key: Key): Promise<void> {
    await navigator.clipboard.writeText(text);
    clearTimeout(timer);
    copiedKey.value = key;
    if (Number.isFinite(feedbackMs)) timer = setTimeout(reset, feedbackMs);
  }

  const isCopied = (key: Key) => copiedKey.value === key;
  const iconOf = (key: Key) => (isCopied(key) ? COPIED_ICON : COPY_ICON);

  onScopeDispose(() => clearTimeout(timer));
  return { copyText, isCopied, iconOf, reset };
}
