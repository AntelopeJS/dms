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

export type ActionTarget =
  | {
      type: "drawer";
      component: Component;
      title?: string;
      description?: string;
      /**
       * Edge the drawer slides in from (`bottom` by default). A `left` or
       * `right` drawer is a side sheet as wide as a side panel, and spans the
       * window's height.
       */
      direction?: DrawerDirection;
    }
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
       * which stays usable. The DMS draws its header: the title, the row's
       * position among the rows shown ("3 of 20"), previous and next buttons
       * (J and K too) and a close button (Esc too). Its component receives the
       * same props as a drawer's (`rowData`, `navigation`…), and is mounted
       * anew on each row. One panel is open at a time: opening it closes a
       * module's side panel, and the other way round.
       */
      type: "sidePanel";
      component: Component;
    } & SidePanelTargetOptions)
  | { type: "page"; url: string }
  | { type: "external"; url: string; newTab?: boolean }
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

export type ActionTargetSerialized =
  | {
      type: "drawer";
      component: ComponentInfoSerialized;
      title?: string;
      description?: string;
      /**
       * Edge the drawer slides in from (`bottom` by default). A `left` or
       * `right` drawer is a side sheet as wide as a side panel, and spans the
       * window's height.
       */
      direction?: DrawerDirection;
    }
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
       * which stays usable. The DMS draws its header: the title, the row's
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
