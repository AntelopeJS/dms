import { pageQueryValues } from "../../utils/pageQuery";

/**
 * Reads the same page cache that Inertia hydrates before navigation. Missing
 * layouts (including newly registered dev pages) use the shared deduped loader.
 */
export async function usePageLayout() {
  const route = useDmsRoute();
  const siteLayout = useSiteLayout();

  const layoutUrl = computed(() => {
    const metadata = siteLayout.findMatchingRoute(route.path)?.metadata;
    return metadata?.hasAccess === false ? undefined : metadata?.layoutUrl;
  });
  const pageLayout = computed(() =>
    layoutUrl.value
      ? (siteLayout.pageLayouts.value[layoutUrl.value] ?? null)
      : null,
  );
  const load = async () => {
    if (layoutUrl.value && !pageLayout.value) {
      // Asked with the page query, for the header buttons whose availability
      // depends on it; cached for the page whatever its query.
      await siteLayout.loadPageLayout(
        layoutUrl.value,
        pageQueryValues(route.query),
      );
    }
  };
  watch([layoutUrl, () => siteLayout.pageLayouts.value], load);
  await load();

  return { pageLayout };
}
