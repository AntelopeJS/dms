// The face every page sets its text in. Fetched only once the stylesheet is
// parsed, it landed after the first paint, and the swap from the fallback face
// moved the header and the page text (wider breadcrumbs, other line breaks).
// Preloaded from the head, it is there for the first paint. Imported rather
// than named, so it is the build's own file: named after its content, cached
// for good, the same file the stylesheet's `@font-face` asks for.
import geistVariable from "../assets/fonts/Geist-Variable.woff2";

const FONT_TYPE = "font/woff2";

/** Server only: the link only matters in the server-rendered head. */
export default defineDmsPlugin(() => {
  if (!import.meta.env.SSR) return;
  useHead({
    link: [
      {
        rel: "preload",
        as: "font",
        type: FONT_TYPE,
        href: geistVariable,
        crossorigin: "anonymous",
      },
    ],
  });
});
