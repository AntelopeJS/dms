// The two faces every page sets its text in. Fetched only once the stylesheet
// is parsed, they landed after the first paint, and the swap from the
// fallback face moved the header and the page text (wider breadcrumbs, other
// line breaks). Preloaded from the head, they are there for the first paint.
const PRELOADED_FONTS = [
  "/fonts/Geist-Variable.woff2",
  "/fonts/GeistMono-Variable.woff2",
];
const FONT_TYPE = "font/woff2";

/** Server only: the links only matter in the server-rendered head. */
export default defineDmsPlugin(() => {
  if (!import.meta.env.SSR) return;
  useHead({
    link: PRELOADED_FONTS.map((href) => ({
      rel: "preload",
      as: "font",
      type: FONT_TYPE,
      href,
      crossorigin: "anonymous",
    })),
  });
});
