import type { Component, ComponentInfoSerialized } from "../../component";
import type { ModalSize } from "./size";

/** The edge of the window a `drawer` action target slides in from. */
export type DrawerDirection = "top" | "right" | "bottom" | "left";

/**
 * What a side panel says when the row its link names is gone: the `?record=`
 * of a deep link, or a `fetchRowUrl` / `get` route answering 404. Texts are
 * `$`-prefixed i18n keys or literals.
 */
export interface SidePanelNotFoundTexts {
  /**
   * Title of the state, e.g. `"$api.request.not_found_title"` for "This
   * request is no longer stored". Defaults to the DMS's generic "This entry
   * is no longer available".
   */
  title?: string;
  /**
   * Text under it, e.g. "It was pruned by the log retention, or the link is
   * wrong." Defaults to the DMS's generic one.
   */
  description?: string;
}

/**
 * What a `sidePanel` action target sets besides its component, shared by the
 * declared and the serialized target.
 */
export interface SidePanelTargetOptions {
  /**
   * Title of the panel header. `$`-prefixed: an i18n key. Defaults to the
   * action's label.
   */
  title?: string;
  /**
   * Title of the header while a row is open, in place of `title`: an i18n key
   * (`$`-prefixed) or a literal receiving the row's fields, as a
   * confirmation's texts do. `"$api.request.heading"` translated "{method}
   * {path}" reads "POST /api/orders". `title` stays the header of a panel
   * showing no row (a missing one).
   * @example "{method} {path}"
   */
  rowTitle?: string;
  /**
   * Position of the open row among the rows the table shows, drawn under the
   * title: an i18n key (`$`-prefixed) receiving `{ index }` (from 1) and
   * `{ total }`, e.g. `"$api.request.position"` for "Request {index} of
   * {total} shown". Defaults to the DMS's generic "{index} of {total}".
   */
  positionLabel?: string;
  /**
   * The open row is kept in the URL (`?record=<id>`, `?<tableId>.record=<id>`
   * on a page with several table views): a link or a reload opens the panel
   * again on that row, and closing it removes the key. On by default for a
   * side panel: `false` opts out. The action's own `deepLink` wins when set.
   */
  deepLink?: boolean;
  /**
   * The words of the panel opened on a row that no longer exists (a deep link
   * to a deleted row): the DMS draws the state and a close button under the
   * header, in place of the component. See {@link SidePanelNotFoundTexts}.
   * @example { title: "$api.request.not_found_title", description: "$api.request.not_found_description" }
   */
  notFound?: SidePanelNotFoundTexts;
}

/**
 * What a `drawer` action target sets besides its component and texts, shared
 * by the declared and the serialized target. A drawer opened on a row takes
 * the row options of a side panel, so a detail panel moves from `sidePanel`
 * to `drawer` without losing any of them.
 */
export interface DrawerTargetOptions extends Omit<
  SidePanelTargetOptions,
  "title" | "deepLink"
> {
  /**
   * Width a `left` or `right` drawer opens at from `lg`, before the user
   * resizes it: a modal's width at that size (`sm` 384px … `5xl` 1024px),
   * `full` the whole window. Without one it opens at 600px. Capped to the window; below `lg` an
   * unsized one is 440px wide, and on a phone every side drawer, sized or
   * not, leaves a 2rem strip of backdrop (only `full` fills the screen).
   * A `top` or `bottom` drawer ignores it.
   */
  size?: ModalSize;
  /**
   * The DMS draws the row header, as a side panel's: the title naming the
   * open row (`rowTitle`), its position (`positionLabel`), previous and next
   * buttons next to the close button. On when `rowTitle` or `positionLabel`
   * is set; `false` leaves the header to the drawer's title, `true` draws it
   * with the defaults. A drawer opened on no row, or on a selection, never
   * draws it.
   */
  rowHeader?: boolean;
  /**
   * The open row is kept in the URL (`?record=<id>`), as the action's own
   * `deepLink` does (which wins when set). Off by default for a drawer.
   */
  deepLink?: boolean;
}

/**
 * A `download` action target: the file is fetched with the user's session and
 * saved, the page left as it is.
 */
export interface DownloadActionTarget {
  type: "download";
  /**
   * The file to fetch, with the user's session: takes the same
   * `{{row.field}}` and page URL tokens (`{{params.X}}`, `{{query.X}}`) as a `page` target, a
   * query pair whose token the page has no value for being left out.
   * @example "/api/lang/translations/export?workspace={{query.workspace}}&locale={{query.locale}}"
   */
  url: string;
  /**
   * The saved file's name, same tokens (written as they are, not encoded).
   * Else, or while a token is left without a value, the server's
   * `Content-Disposition` name, else the URL's last path segment.
   * @example "{{query.locale}}.json"
   */
  filename?: string;
}

export type ActionTarget =
  | ({
      /**
       * A drawer: a modal sheet sliding in from an edge of the window. The
       * container for a detail or record panel: from `lg` the user resizes it
       * by its inner edge, and it opens again at that size. Opened on a row,
       * it steps through the rows (J and K) and takes the row options of a
       * side panel (see {@link DrawerTargetOptions}).
       */
      type: "drawer";
      component: Component;
      title?: string;
      description?: string;
      /**
       * Edge the drawer slides in from (`bottom` by default). A `left` or
       * `right` drawer is a side sheet spanning the window's height, 600px
       * wide from `lg` unless `size` says otherwise.
       */
      direction?: DrawerDirection;
    } & DrawerTargetOptions)
  | {
      type: "modal";
      size?: ModalSize;
      component: Component;
      title?: string;
      description?: string;
    }
  | ({
      /**
       * A non-modal panel docked on the right of the page, next to the table,
       * which stays usable. Meant for global, page-independent panels (an
       * assistant dock): a detail or record panel opens in a `drawer`, which
       * takes the same row options. The DMS draws its header: the title, the row's
       * position among the rows shown ("3 of 20"), previous and next buttons
       * (J and K too) and a close button (Esc too). Its component receives the
       * same props as a drawer's (`rowData`, `navigation`…), and is mounted
       * anew on each row, its options' `{{row.X}}` tokens filled with that
       * row (a `ResourceForm` reading `rowId: "{{row._id}}"`). A container
       * block (a `Card` holding blocks) is drawn with its children, their
       * options filled likewise, as in a drawer or a modal. One panel is open
       * at a time: opening it closes a module's side panel, and the other way
       * round.
       */
      type: "sidePanel";
      component: Component;
    } & SidePanelTargetOptions)
  | {
      type: "page";
      /**
       * The page to open. On a row action the row's fields fill
       * `{{row.field}}`;
       * `{{params.X}}` and `{{query.X}}` name the page the action sits on, a
       * query pair whose token the page has no value for being left out.
       */
      url: string;
    }
  | {
      type: "external";
      /** Takes the same `{{row.field}}` and page URL tokens as `page`. */
      url: string;
      newTab?: boolean;
    }
  | DownloadActionTarget
  | {
      type: "quickAction";
      /**
       * Key of the quick action to run: `category:id`, or the bare id when no
       * other category uses it. The action is left out for users the quick
       * action is not served to.
       */
      id: string;
    }
  | {
      type: "api";
      /** Takes the page URL tokens and `{{row.field}}`, as a `page` target. */
      url: string;
      method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      /**
       * JSON body sent with the request. The values of the action's confirm
       * `fields` are merged into it, the input winning.
       */
      body?: Record<string, unknown>;
      /**
       * Field of the JSON response copied to the clipboard on success (a
       * share link, a token).
       */
      copy?: string;
      successMessage: string;
    }
  | {
      type: "exportJob";
      /** Takes the page URL tokens and `{{row.field}}`, as a `page` target. */
      url: string;
      method?: "GET" | "POST";
      /** As `url`, plus `{{job.id}}`: the id of the job the start answered. */
      statusUrl?: string;
      /** As `url`, plus `{{job.id}}`: the id of the job the start answered. */
      downloadUrl?: string;
      labels?: {
        title?: string;
        exporting?: string;
        downloading?: string;
        successTitle?: string;
        successMessage?: string;
        errorTitle?: string;
        retry?: string;
      };
    };

export type ActionTargetSerialized =
  | ({
      /**
       * A drawer: a modal sheet sliding in from an edge of the window. The
       * container for a detail or record panel: from `lg` the user resizes it
       * by its inner edge, and it opens again at that size. Opened on a row,
       * it steps through the rows (J and K) and takes the row options of a
       * side panel (see {@link DrawerTargetOptions}).
       */
      type: "drawer";
      component: ComponentInfoSerialized;
      title?: string;
      description?: string;
      /**
       * Edge the drawer slides in from (`bottom` by default). A `left` or
       * `right` drawer is a side sheet spanning the window's height, 600px
       * wide from `lg` unless `size` says otherwise.
       */
      direction?: DrawerDirection;
    } & DrawerTargetOptions)
  | {
      type: "modal";
      size?: ModalSize;
      component: ComponentInfoSerialized;
      title?: string;
      description?: string;
    }
  | ({
      /**
       * A non-modal panel docked on the right of the page, next to the table,
       * which stays usable. Meant for global, page-independent panels (an
       * assistant dock): a detail or record panel opens in a `drawer`, which
       * takes the same row options. The DMS draws its header: the title, the row's
       * position among the rows shown ("3 of 20"), previous and next buttons
       * (J and K too) and a close button (Esc too). Its component receives the
       * same props as a drawer's (`rowData`, `navigation`…), and is mounted
       * anew on each row. One panel is open at a time: opening it closes a
       * module's side panel, and the other way round.
       */
      type: "sidePanel";
      component: ComponentInfoSerialized;
    } & SidePanelTargetOptions)
  | { type: "page"; url: string }
  | { type: "external"; url: string; newTab?: boolean }
  | DownloadActionTarget
  | {
      type: "quickAction";
      /**
       * Key of the quick action to run: `category:id`, or the bare id when no
       * other category uses it. The action is left out for users the quick
       * action is not served to.
       */
      id: string;
    }
  | {
      type: "api";
      url: string;
      method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      /**
       * JSON body sent with the request. The values of the action's confirm
       * `fields` are merged into it, the input winning.
       */
      body?: Record<string, unknown>;
      /**
       * Field of the JSON response copied to the clipboard on success (a
       * share link, a token).
       */
      copy?: string;
      successMessage: string;
    }
  | {
      type: "exportJob";
      url: string;
      method?: "GET" | "POST";
      statusUrl?: string;
      downloadUrl?: string;
      labels?: {
        title?: string;
        exporting?: string;
        downloading?: string;
        successTitle?: string;
        successMessage?: string;
        errorTitle?: string;
        retry?: string;
      };
    };
