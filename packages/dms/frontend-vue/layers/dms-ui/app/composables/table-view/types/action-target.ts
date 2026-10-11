import type { DrawerDirection } from "../../containers/types";

/** What a `sidePanel` target sets besides its component (backend `SidePanelTargetOptions`). */
export interface SidePanelTargetOptions {
  /** Title of the panel header (`$`: an i18n key); the action's label else. */
  title?: string;
  /**
   * The row's position under the title: an i18n key (`$`-prefixed) receiving
   * `{ index }` (from 1) and `{ total }`.
   */
  positionLabel?: string;
  /** The open row is kept in the URL (`?record=`): on unless `false`. */
  deepLink?: boolean;
}

export type ActionTarget =
  | {
      type: "drawer";
      component: ComponentInfo;
      title?: string;
      description?: string;
      /** Edge the drawer slides in from (`bottom` by default). */
      direction?: DrawerDirection;
    }
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
  /** Runs a quick action, by its `category:id` key or bare id. */
  | { type: "quickAction"; id: string }
  | {
      type: "api";
      url: string;
      method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      /** JSON body sent with the request. */
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
