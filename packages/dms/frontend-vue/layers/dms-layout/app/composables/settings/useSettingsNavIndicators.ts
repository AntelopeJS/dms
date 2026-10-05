import { onMounted, watch, type Ref } from "vue";
import { useNavBadges } from "#dms-ui/app/composables/navigation/useNavBadges";
import { useTableDataChanges } from "#dms-ui/app/composables/table-view/useTableDataChanges";
import { useSecurityOverview } from "./security/useSecurityOverview";
import { INVITES_PAGE_ID } from "./useSettingsNavigation";
import { useSettingsNavTrails } from "./useSettingsNavTrails";

const ROLES_PAGE_ID = "settings.user.roles";
const SECURITY_PAGE_ID = "settings.user.security";
// Data API locations of the members and invitations lists.
const MEMBERS_LOCATION = "/api/tables/members";
const INVITES_LOCATION = "/api/tables/admin-invites";
const ROLES_OVERVIEW_ENDPOINT = "/settings/user/roles/overview";
// The source the Members table's Invitations tab counts from.
const INVITES_LIST_ENDPOINT = `${INVITES_LOCATION}/list`;
const INVITES_COUNT_QUERY = { limit: 1, offset: 0 };

interface RolesOverviewSummary {
  roles?: unknown[];
}

interface ListTotal {
  total?: number;
}

/**
 * Loads the indicators of the settings navigation — the role count,
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
  const { tableDataVersion } = useTableDataChanges();

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

  /** Reads a loaded count again; the entry keeps its last one on failure. */
  function reload(pageId: string): void {
    if (!loaded.has(pageId) || !visiblePageIds.value.has(pageId)) return;
    loaders[pageId]?.().catch(() => {
      /* the entry keeps its last indicator */
    });
  }

  onMounted(() => {
    loadVisible();
    watch(visiblePageIds, loadVisible);
    // The members and invitations lists change each other: an invitation
    // sent, resent, edited, revoked or accepted, a member removed. Whenever
    // either list reads its rows again after a change, the invitations count
    // follows, without waiting for a move to another page. (The members
    // count is the server's navigation badge, kept fresh by those tables.)
    watch(tableDataVersion([MEMBERS_LOCATION, INVITES_LOCATION]), () => {
      reload(INVITES_PAGE_ID);
    });
    // Changes made elsewhere (another session) show on the next move
    // between settings pages.
    watch(
      () => route.path,
      () => reload(INVITES_PAGE_ID),
    );
  });
}
