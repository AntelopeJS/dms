export function usePrefetch() {
  const siteLayout = useSiteLayout();

  function prefetchPageLayout(slug: string): void {
    const page = siteLayout.siteLayout.value?.pages?.[slug];
    if (!page?.layoutUrl) return;

    const cached = siteLayout.pageLayouts.value[page.layoutUrl];
    if (cached) {
      prefetchPageLayoutComponents(cached);
      return;
    }

    siteLayout
      .loadPageLayout(page.layoutUrl)
      .then((layout) => prefetchPageLayoutComponents(layout))
      .catch(() => {});
  }

  return { prefetchPageLayout };
}
