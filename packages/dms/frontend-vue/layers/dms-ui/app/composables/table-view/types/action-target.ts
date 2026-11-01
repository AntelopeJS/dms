import type { DrawerDirection } from "../../containers/types";

/** What a side panel says on a row that is gone (backend `SidePanelNotFoundTexts`). */
export interface SidePanelNotFoundTexts {
  /** `$`: an i18n key; the DMS's generic title else. */
  title?: string;
  /** `$`: an i18n key; the DMS's generic text else. */
  description?: string;
}

/** What a `sidePanel` target sets besides its component (backend `SidePanelTargetOptions`). */
export interface SidePanelTargetOptions {
  /** Title of the panel header (`$`: an i18n key); the action's label else. */
  title?: string;
  /** Title of the header while a row is open, receiving the row's fields. */
  rowTitle?: string;
  /**
   * The row's position under the title: an i18n key (`$`-prefixed) receiving
   * `{ index }` (from 1) and `{ total }`.
   */
  positionLabel?: string;
  /**
   * The open row is kept in the URL (`?record=`): on unless `false` for a
   * side panel, off unless `true` for a drawer.
   */
  deepLink?: boolean;
  /** The state drawn on a row that no longer exists (a 404). */
  notFound?: SidePanelNotFoundTexts;
}

/**
 * What a `drawer` target sets besides its component (backend
 * `DrawerTargetOptions`): the row options of a side panel, for a drawer
 * opened on a row, and its size.
 */
export interface DrawerTargetOptions
  extends Omit<SidePanelTargetOptions, "title"> {
  /** Width of a `left` / `right` drawer: a modal's at that size; 600px without one. */
  size?: ModalSize;
  /**
   * The DMS draws the row header (title, position, previous / next): on when
   * `rowTitle` or `positionLabel` is set, unless `false`.
   */
  rowHeader?: boolean;
}

/**
 * Fetches a file with the user's session and saves it (backend
 * `DownloadActionTarget`).
 */
export interface DownloadActionTarget {
  type: "download";
  /** Takes the `{{row.field}}` and `{{params.X}}` / `{{query.X}}` tokens. */
  url: string;
  /** Saved under; the response's `Content-Disposition` name, else the URL's. */
  filename?: string;
}

export type ActionTarget =
  | ({
      type: "drawer";
      component: ComponentInfo;
      title?: string;
      description?: string;
      /** Edge the drawer slides in from (`bottom` by default). */
      direction?: DrawerDirection;
    } & DrawerTargetOptions)
  | {
      type: "modal";
      size?: ModalSize;
      component: ComponentInfo;
      title?: string;
      description?: string;
    }
  /** A non-modal panel docked on the right of the page, on a row. */
  | ({ type: "sidePanel"; component: ComponentInfo } & SidePanelTargetOptions)
  | { type: "page"; url: string }
  | { type: "external"; url: string; newTab?: boolean }
  | DownloadActionTarget
  /** Runs a quick action, by its `category:id` key or bare id. */
  | { type: "quickAction"; id: string }
  | {
      type: "api";
      url: string;
      method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      /** JSON body sent with the request. */
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- API action bodies are module-defined JSON dictionaries; inference has no initializer and the transport's body owner is broader than this existing object contract.
      body?: Record<string, unknown>;
      /** Field of the JSON response copied to the clipboard on success. */
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
