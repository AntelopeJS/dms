export default defineDmsPlugin(async () => {
  const { metaTitle, metaDescription, refresh } = useSystemState();

  useSeoMeta({
    titleTemplate(title) {
      return title ? `${title} | ${metaTitle.value}` : metaTitle.value;
    },
    description: metaDescription,
    ogTitle: metaTitle,
    ogDescription: metaDescription,
    twitterTitle: metaTitle,
    twitterDescription: metaDescription,
    twitterCard: "summary_large_image",
  });

  useHead({
    titleTemplate(title) {
      return title ? `${title} | ${metaTitle.value}` : metaTitle.value;
    },
    meta: [
      {
        name: "description",
        content: metaDescription,
      },
    ],
  });

  if (!metaTitle.value) await refresh();
});
