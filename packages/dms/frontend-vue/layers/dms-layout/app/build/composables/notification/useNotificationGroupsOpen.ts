/** `localStorage` key prefix of the open or folded state of each preferences group. */
export const NOTIFICATION_GROUP_STORAGE_PREFIX = "dms-notification-group:";

const OPEN = "open";
const FOLDED = "folded";

function storageKey(categoryId: string): string {
  return `${NOTIFICATION_GROUP_STORAGE_PREFIX}${categoryId}`;
}

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
    /* storage unavailable (private mode, quota): the group folds on reload */
  }
}

/**
 * Which groups of the preferences matrix are open. A group starts folded,
 * so the page opens short and each group row's count sums it up; the state
 * the viewer picks is kept per group in this browser.
 */
export const useNotificationGroupsOpen = () => {
  const picked = ref<Record<string, boolean>>({});

  const isOpen = (categoryId: string): boolean =>
    picked.value[categoryId] ?? readStorage(storageKey(categoryId)) === OPEN;

  const toggleOpen = (categoryId: string) => {
    const open = !isOpen(categoryId);
    picked.value = { ...picked.value, [categoryId]: open };
    writeStorage(storageKey(categoryId), open ? OPEN : FOLDED);
  };

  return { isOpen, toggleOpen };
};
