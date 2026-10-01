import type { Component, ComponentInfoSerialized } from "../../component";
import type { ModalSize } from "./size";

export type ActionTarget =
  | {
      type: "drawer";
      component: Component;
      title?: string;
      description?: string;
    }
  | {
      type: "modal";
      size?: ModalSize;
      component: Component;
      title?: string;
      description?: string;
    }
  | { type: "page"; url: string }
  | { type: "external"; url: string; newTab?: boolean }
  | {
      type: "api";
      url: string;
      method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      /** JSON body sent with the request. */
      body?: Record<string, unknown>;
      /**
       * Field of the JSON response copied to the clipboard on success (a
       * share link, a token).
       */
      copy?: string;
      successMessage: string;
      /**
       * Asked first. On a row action, the texts receive the row's fields as
       * i18n parameters (`"Remove {name}?"`).
       */
      confirm?: {
        title: string;
        description: string;
        confirmColor?: "primary" | "error" | "warning";
        /** Header icon of the dialog. */
        icon?: string;
        /** Text of the confirm button. `$`-prefixed: an i18n key. */
        confirmLabel?: string;
      };
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
      confirm?: {
        title: string;
        description: string;
        confirmColor?: "primary" | "error" | "warning";
      };
    };

export type ActionTargetSerialized =
  | {
      type: "drawer";
      component: ComponentInfoSerialized;
      title?: string;
      description?: string;
    }
  | {
      type: "modal";
      size?: ModalSize;
      component: ComponentInfoSerialized;
      title?: string;
      description?: string;
    }
  | { type: "page"; url: string }
  | { type: "external"; url: string; newTab?: boolean }
  | {
      type: "api";
      url: string;
      method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      /** JSON body sent with the request. */
      body?: Record<string, unknown>;
      /**
       * Field of the JSON response copied to the clipboard on success (a
       * share link, a token).
       */
      copy?: string;
      successMessage: string;
      /**
       * Asked first. On a row action, the texts receive the row's fields as
       * i18n parameters (`"Remove {name}?"`).
       */
      confirm?: {
        title: string;
        description: string;
        confirmColor?: "primary" | "error" | "warning";
        /** Header icon of the dialog. */
        icon?: string;
        /** Text of the confirm button. `$`-prefixed: an i18n key. */
        confirmLabel?: string;
      };
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
      confirm?: {
        title: string;
        description: string;
        confirmColor?: "primary" | "error" | "warning";
      };
    };
