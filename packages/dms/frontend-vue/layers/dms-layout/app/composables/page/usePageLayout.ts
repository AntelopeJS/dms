import {
  fillRouteParams,
  pageQueryValues,
} from "#dms-core/app/utils/pageQuery";

/**
 * Reads the same page cache that Inertia hydrates before navigation. Missing
 * layouts (including newly registered dev pages) use the shared deduped loader.
 */
export async function usePageLayout() {
  const route = useDmsRoute();
  const siteLayout = useSiteLayout();

  const match = computed(() => siteLayout.findMatchingRoute(route.path));
  const layoutUrl = computed(() => {
    const metadata = match.value?.metadata;
    return metadata?.hasAccess === false ? undefined : metadata?.layoutUrl;
  });
  const pageLayout = computed(() =>
    layoutUrl.value
      ? (siteLayout.pageLayouts.value[layoutUrl.value] ?? null)
      : null,
  );
  const load = async () => {
    if (layoutUrl.value && !pageLayout.value) {
      await siteLayout.loadPageLayout(
        layoutUrl.value,
        pageQueryValues(route.query),
        fillRouteParams(layoutUrl.value, match.value?.params ?? {}),
      );
    }
  };
  watch([layoutUrl, () => siteLayout.pageLayouts.value], load);
  await load();

  return { pageLayout };
}
