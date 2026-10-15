import { computed } from "vue";
import type { DmsLogoSources } from "#dms-core/shared/types/app-config";

const ICON_TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
  webp: "image/webp",
};
const FILE_EXTENSION = /\.([a-z0-9]+)(?:[?#]|$)/i;
const LIGHT_SCHEME_MEDIA = "(prefers-color-scheme: light)";
const DARK_SCHEME_MEDIA = "(prefers-color-scheme: dark)";

// A type rather than an interface: unhead's link type carries an index
// signature (`data-*`), which only a type alias satisfies implicitly.
type IconLink = {
  rel: "icon";
  href: string;
  type?: string;
  media?: string;
};

function iconLink(href: string, media?: string): IconLink {
  const extension = FILE_EXTENSION.exec(href)?.[1].toLowerCase() ?? "";
  const type = ICON_TYPES[extension];
  return {
    rel: "icon",
    href,
    ...(type ? { type } : {}),
    ...(media ? { media } : {}),
  };
}

function faviconLinks(favicon: Partial<DmsLogoSources> = {}): IconLink[] {
  const { light, dark } = favicon;
  if (light && dark && light !== dark)
    return [
      iconLink(light, LIGHT_SCHEME_MEDIA),
      iconLink(dark, DARK_SCHEME_MEDIA),
    ];
  const icon = light || dark;
  return icon ? [iconLink(icon)] : [];
}

/**
 * The browser tab icon, `branding.logo.favicon`. Its light and dark files
 * follow the operating system's scheme: the browser draws the tab outside the
 * page, where the dashboard's color mode does not reach. The app config is
 * read inside the computed, so an edit applied in development without a
 * reload replaces the icon too.
 */
export default defineDmsPlugin(() => {
  useHead(
    computed(() => ({
      link: faviconLinks(useDmsAppConfig().branding.logo?.favicon),
    })),
  );
});
