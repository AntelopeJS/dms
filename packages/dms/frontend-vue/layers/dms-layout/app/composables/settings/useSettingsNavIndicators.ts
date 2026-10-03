import { onMounted, watch, type Ref } from "vue";
import { useNavBadges } from "#dms-ui/app/composables/navigation/useNavBadges";
import { useSecurityOverview } from "./security/useSecurityOverview";
import { INVITES_PAGE_ID } from "./useSettingsNavigation";
import { useSettingsNavTrails } from "./useSettingsNavTrails";

const MEMBERS_PAGE_ID = "settings.user.members";
const ROLES_PAGE_ID = "settings.user.roles";
const SECURITY_PAGE_ID = "settings.user.security";
const MEMBERS_COUNT_ENDPOINT = "/api/tables/members/count/batch";
const ROLES_OVERVIEW_ENDPOINT = "/settings/user/roles/overview";
const MEMBERS_COUNT_QUERY_ID = "all";
// The source the Members table's Invitations tab counts from.
const INVITES_LIST_ENDPOINT = "/api/tables/admin-invites/list";
const INVITES_COUNT_QUERY = { limit: 1, offset: 0 };

interface RolesOverviewSummary {
  roles?: unknown[];
}

interface ListTotal {
  total?: number;
}

/**
 * Loads the indicators of the settings navigation — member and role counts,
 * the security attention dot — as soon as the navigation shows, so they
 * don't wait for a visit to each page. Only pages the viewer can open (the
 * ones listed in the nav) are asked, so no request ends in a 403; a failed
 * request just leaves its entry without an indicator.
 */
export function useSettingsNavIndicators(visiblePageIds: Ref<Set<string>>) {
  const { $authFetch } = useAuthFetch();
  const { setNavBadge } = useNavBadges();
  const { setTrail, settleIndicator } = useSettingsNavTrails();
  const security = useSecurityOverview();
  const { t } = useI18n();
  const route = useDmsRoute();

  async function loadMembersCount(): Promise<void> {
    const counts = await $authFetch<Record<string, number>>(
      MEMBERS_COUNT_ENDPOINT,
      {
        method: "POST",
        body: { queries: [{ id: MEMBERS_COUNT_QUERY_ID, query: {} }] },
      },
    );
    const count = counts?.[MEMBERS_COUNT_QUERY_ID];
    if (typeof count === "number") setNavBadge(MEMBERS_PAGE_ID, String(count));
  }

  async function loadRolesCount(): Promise<void> {
    const overview = await $authFetch<RolesOverviewSummary>(
      ROLES_OVERVIEW_ENDPOINT,
    );
    if (Array.isArray(overview?.roles)) {
      setNavBadge(ROLES_PAGE_ID, String(overview.roles.length));
    }
  }

  // A trail rather than a nav badge: the overview card shows its label too.
  async function loadInvitesCount(): Promise<void> {
    const response = await $authFetch<ListTotal>(INVITES_LIST_ENDPOINT, {
      query: INVITES_COUNT_QUERY,
    });
    const count = response?.total;
    if (typeof count !== "number") return;
    setTrail({
      fullId: INVITES_PAGE_ID,
      badge: count > 0 ? String(count) : undefined,
      label: t("page.settings.shell.pending_invitations", count),
    });
  }

  const loaders: Record<string, () => Promise<void>> = {
    [MEMBERS_PAGE_ID]: loadMembersCount,
    [ROLES_PAGE_ID]: loadRolesCount,
    [INVITES_PAGE_ID]: loadInvitesCount,
    [SECURITY_PAGE_ID]: () => security.refresh(),
  };
  const loaded = new Set<string>();

  function loadVisible(): void {
    for (const [pageId, load] of Object.entries(loaders)) {
      if (loaded.has(pageId) || !visiblePageIds.value.has(pageId)) continue;
      loaded.add(pageId);
      load()
        .catch(() => {
          /* the entry simply shows no indicator */
        })
        .finally(() => settleIndicator(pageId));
    }
  }

  onMounted(() => {
    loadVisible();
    watch(visiblePageIds, loadVisible);
    // Invitations are sent, resent and revoked from pages that publish no
    // count of them: read it again on each move between settings pages.
    watch(
      () => route.path,
      () => {
        if (!visiblePageIds.value.has(INVITES_PAGE_ID)) return;
        loadInvitesCount().catch(() => {
          /* the entry keeps its last indicator */
        });
      },
    );
  });
}
