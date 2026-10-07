import { computed, ref, watch, type Ref } from "vue";

/** A set of backup codes, as issued to one account. */
interface RevealedBackupCodes {
  userId: string;
  codes: string[];
  /** The set replaced a previous one, which stopped working. */
  isRegenerated: boolean;
}

/**
 * The backup codes shown once, right after they were issued. Held by the
 * component showing them rather than in shared state, tied to the account
 * they were issued for, and dropped as soon as their dialog closes or the
 * session changes: switching accounts in the same tab must not show one
 * account's codes to another.
 *
 * @param userId The signed-in account
 */
export function useRevealedBackupCodes(userId: Ref<string | undefined>) {
  const revealed = ref<RevealedBackupCodes | null>(null);
  const isOpen = ref(false);

  const current = computed(() =>
    revealed.value && revealed.value.userId === userId.value
      ? revealed.value
      : null,
  );
  const codes = computed(() => current.value?.codes ?? []);
  const isRegenerated = computed(() => current.value?.isRegenerated ?? false);

  function forget(): void {
    revealed.value = null;
    isOpen.value = false;
  }

  /** Keeps a freshly issued set for the signed-in account, until shown and closed. */
  function reveal(backupCodes: string[], regenerated = false): void {
    if (!userId.value || !backupCodes.length) return;
    revealed.value = {
      userId: userId.value,
      codes: backupCodes,
      isRegenerated: regenerated,
    };
  }

  watch(userId, forget);
  watch(isOpen, (open) => {
    if (!open) revealed.value = null;
  });

  return { codes, isRegenerated, isOpen, reveal };
}
