import type { ComponentInfo } from "../component";

export interface DefaultLayoutOptions {
  /**
   * Content spans the whole panel. Defaults to `true`: dashboard pages are
   * full-width unless they opt out. Set to `false` for pages that only hold a
   * form, where a constrained column stays readable.
   */
  fullWidth?: boolean;
  hideHeader?: boolean;
  /**
   * The page fills the height of the dashboard panel instead of growing with
   * its content, for a page built around one tool that scrolls inside itself:
   * a file explorer, a data grid, a canvas. The page header keeps its height
   * and the last component of the page takes the rest: give its root
   * `flex-1 min-h-0` and let an element inside it scroll. The page stops
   * shrinking at a minimum height, below which the panel scrolls again.
   * Defaults to `false`.
   */
  fillHeight?: boolean;
}

export function DefaultLayout(options?: DefaultLayoutOptions): ComponentInfo {
  return {
    componentName: "dms-default-layout",
    options: {
      fullWidth: true,
      ...options,
    },
  };
}

/**
 * Standard dashboard frame for a page that holds nothing but a form: keeps the
 * constrained, readable content column instead of the full-width default.
 */
export function FormPageLayout(
  options?: Omit<DefaultLayoutOptions, "fullWidth">,
): ComponentInfo {
  return DefaultLayout({ ...options, fullWidth: false });
}

export function EmptyLayout(): ComponentInfo {
  return {
    componentName: "dms-empty-layout",
    options: {},
  };
}
