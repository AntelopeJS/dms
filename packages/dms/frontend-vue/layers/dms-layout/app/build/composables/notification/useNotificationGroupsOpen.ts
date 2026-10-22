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
 *
 * The kept state is read once mounted: the server cannot see it, so the
 * server render and the browser hydrating it both draw every group folded,
 * and a kept group opens right after (reading it in setup left the
 * collapsible open on one side and folded on the other).
 */
export const useNotificationGroupsOpen = () => {
  const picked = ref<Record<string, boolean>>({});
  const isMounted = ref(false);
  onMounted(() => {
    isMounted.value = true;
  });

  const isOpen = (categoryId: string): boolean =>
    picked.value[categoryId] ??
    (isMounted.value && readStorage(storageKey(categoryId)) === OPEN);

  const toggleOpen = (categoryId: string) => {
    const open = !isOpen(categoryId);
    picked.value = { ...picked.value, [categoryId]: open };
    writeStorage(storageKey(categoryId), open ? OPEN : FOLDED);
  };

  return { isOpen, toggleOpen };
};
