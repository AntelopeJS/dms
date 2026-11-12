/**
 * A sidebar entry a module keeps visible but closed: the sidebar draws it
 * muted, hatched and locked, shows `reason` as its tooltip, and drops its link.
 * Serializable, so a lock can be set from a regular (SSR-safe) plugin.
 */
export interface MenuLock {
  /** `fullId` of the locked page or category, as registered. */
  fullId: string;
  /**
   * Why the entry is closed, shown as its tooltip. A `$`-prefixed value
   * resolves as an i18n key through `useTranslation().processI18n`.
   */
  reason: string;
}

interface UseMenuLocksReturn {
  locks: Readonly<Ref<MenuLock[]>>;
  lock: (menuLock: MenuLock) => void;
  unlock: (fullId: string) => void;
}

/**
 * Registry of the sidebar entries modules keep locked, keyed by `fullId`.
 * `lock` replaces the reason of an entry already locked, and `unlock` of an
 * entry that is not locked does nothing, so both can run on every mount.
 */
export const useMenuLocks = (): UseMenuLocksReturn => {
  const locks = useDmsState<MenuLock[]>("dms-menu-locks", () => []);

  function lock(menuLock: MenuLock): void {
    const known = locks.value.find((entry) => entry.fullId === menuLock.fullId);
    if (known?.reason === menuLock.reason) return;
    locks.value = [
      ...locks.value.filter((entry) => entry.fullId !== menuLock.fullId),
      { fullId: menuLock.fullId, reason: menuLock.reason },
    ];
  }

  function unlock(fullId: string): void {
    if (!locks.value.some((entry) => entry.fullId === fullId)) return;
    locks.value = locks.value.filter((entry) => entry.fullId !== fullId);
  }

  return { locks, lock, unlock };
};
