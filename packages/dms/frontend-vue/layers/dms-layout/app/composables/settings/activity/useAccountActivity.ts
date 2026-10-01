import { computed, onMounted, ref } from "vue";
import { useSettingsNavigation } from "../useSettingsNavigation";
import {
  type AccountActivityEvent,
  type AccountActivityRow,
  activityViewAllPage,
  buildAccountActivityRows,
} from "./buildAccountActivity";

/** The signed-in user's own events, merged and sorted by the backend. */
export const ACCOUNT_ACTIVITY_ENDPOINT = "/settings/user/profile/activity";

/**
 * The rows of the settings overview's "Recent account activity" card.
 *
 * One request: the backend merges the viewer's sessions, account
 * notifications, credential timestamps, memberships and sent invitations, and
 * leaves out a source it could not read. A failed request reads as no
 * activity. Rows link only to the settings pages the viewer can open.
 */
export function useAccountActivity() {
  const { groups } = useSettingsNavigation();
  const { $authFetch } = useAuthFetch();

  const pages = computed<Record<string, string>>(() =>
    Object.fromEntries(
      groups.value.flatMap((group) =>
        group.pages.map((page) => [page.fullId, page.to]),
      ),
    ),
  );

  const events = ref<AccountActivityEvent[]>([]);
  const isLoading = ref(true);

  onMounted(async () => {
    try {
      const response = await $authFetch<AccountActivityEvent[]>(
        ACCOUNT_ACTIVITY_ENDPOINT,
      );
      events.value = Array.isArray(response) ? response : [];
    } catch {
      events.value = [];
    } finally {
      isLoading.value = false;
    }
  });

  const rows = computed<AccountActivityRow[]>(() =>
    buildAccountActivityRows(events.value, pages.value),
  );
  const viewAll = computed(() => activityViewAllPage(pages.value));

  return { rows, viewAll, isLoading };
}
