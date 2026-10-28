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
