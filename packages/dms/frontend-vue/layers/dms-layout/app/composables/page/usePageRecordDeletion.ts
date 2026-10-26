import { onScopeDispose, type Ref, watch } from "vue";
import type { RealtimeTopicHandler } from "#dms-core/app/composables/realtime/useUserRealtime";
import type { PageLayout } from "../../types/page";
import {
  fillRouteParams,
  isSamePageQuery,
  isSameRouteParams,
  isViewStateKey,
  layoutUrlWithQuery,
  pageQueryValues,
} from "../../utils/pageQuery";

const BURST_WINDOW_MS = 16;

/** How the server read the record a page shows (`DefaultLayout({ record })`). */
type PageRecordStatus = "found" | "missing" | "error";

interface RecordLayoutOptions {
  recordStatus?: PageRecordStatus;
  headerActionsQuery?: Record<string, string>;
  headerActionsParams?: Record<string, string>;
}

/** What the page's record deletion listens to. */
export interface PageRecordDeletionSource {
  /** The page's layout as it was first served. */
  pageLayout: () => PageLayout | null;
  /** The page's realtime topics, once its session is subscribed to it. */
  pageTopics: Ref<string[]>;
  subscribe(topic: string, handler: RealtimeTopicHandler): () => void;
}

const optionsOf = (
  layout: PageLayout | null | undefined,
): RecordLayoutOptions | undefined => layout?.layout.options;

/**
 * Leaves a detail page whose record was deleted, in every tab and for every
 * member on it. The layout of a page reading a record (`DefaultLayout({
 * record })`) says how the server read it (`recordStatus`); on each event of
 * one of the page's realtime topics, the page asks its layout again, and a
 * record it had `found` that is now `missing` was deleted: a toast says so,
 * and the page opens its list (`MenuOptions.parent`), or stays on its
 * not-found blocks without one. A page reading no record never asks.
 */
export function usePageRecordDeletion(source: PageRecordDeletionSource): void {
  if (import.meta.env.SSR) return;
  const route = useDmsRoute();
  const siteLayout = useSiteLayout();
  const toast = useToast();
  const { t } = useI18n();

  const pageRoute = () => siteLayout.findMatchingRoute(route.path);
  const currentQuery = () => pageQueryValues(route.query);
  /** The page URL the record is named by, leaving out the view's state. */
  const recordKey = () =>
    JSON.stringify([
      route.path,
      Object.entries(currentQuery()).filter(([name]) => !isViewStateKey(name)),
    ]);

  let known: { key: string; status: PageRecordStatus } | undefined;
  let latestRead = 0;

  async function readStatus(): Promise<PageRecordStatus | undefined> {
    const match = pageRoute();
    const layoutUrl = match?.metadata?.layoutUrl;
    if (!layoutUrl) return undefined;
    const { $authFetch } = useAuthFetch();
    try {
      const layout = await $authFetch<PageLayout>(
        layoutUrlWithQuery(
          fillRouteParams(layoutUrl, match.params ?? {}),
          currentQuery(),
        ),
      );
      return optionsOf(layout)?.recordStatus;
    } catch {
      return undefined;
    }
  }

  async function leave(): Promise<void> {
    toast.add({
      title: t("page.record_deleted.title"),
      description: t("page.record_deleted.description"),
      color: "warning",
      icon: "i-ph-trash",
    });
    const match = pageRoute();
    const parentSlug = match?.metadata?.parentSlug;
    if (!parentSlug) return;
    const path = fillRouteParams(parentSlug, match.params ?? {});
    if (path.includes(":")) return;
    const parent = siteLayout.findMatchingRoute(path)?.metadata;
    if (!parent || parent.hasAccess === false) return;
    await navigateDms(path, { replace: true });
  }

  async function check(): Promise<void> {
    const key = recordKey();
    const read = ++latestRead;
    const status = await readStatus();
    if (read !== latestRead || key !== recordKey() || !status) return;
    const previous = known?.key === key ? known.status : undefined;
    known = { key, status };
    if (previous === "found" && status === "missing") await leave();
  }

  const declaresRecord = () =>
    optionsOf(source.pageLayout())?.recordStatus !== undefined;

  function follow(): void {
    if (known?.key === recordKey()) return;
    latestRead++;
    known = undefined;
    const options = optionsOf(source.pageLayout());
    if (!options?.recordStatus) return;
    const served =
      isSamePageQuery(options.headerActionsQuery ?? {}, currentQuery()) &&
      isSameRouteParams(
        options.headerActionsParams ?? {},
        pageRoute()?.params ?? {},
      );
    if (served) known = { key: recordKey(), status: options.recordStatus };
    else void check();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  const onEvent: RealtimeTopicHandler = (event) => {
    if (!("type" in event) || !declaresRecord()) return;
    clearTimeout(timer);
    timer = setTimeout(() => void check(), BURST_WINDOW_MS);
  };

  let unsubscribes: Array<() => void> = [];
  const unsubscribeAll = () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
    unsubscribes = [];
  };
  watch(
    source.pageTopics,
    (topics) => {
      unsubscribeAll();
      unsubscribes = topics.map((topic) => source.subscribe(topic, onEvent));
    },
    { immediate: true },
  );
  watch([() => route.path, () => route.query, source.pageLayout], follow, {
    immediate: true,
  });
  onScopeDispose(() => {
    unsubscribeAll();
    clearTimeout(timer);
    latestRead++;
  });
}
