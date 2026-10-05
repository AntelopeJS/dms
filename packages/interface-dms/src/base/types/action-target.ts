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

/**
 * An action target as the options carry it: a component target is serialized,
 * every other kind is plain data already.
 */
export function serializeActionTarget(
  target: ActionTarget,
): ActionTargetSerialized {
  if (target.type === "drawer" || target.type === "modal") {
    return { ...target, component: target.component.serializeSync() };
  }
  return target;
}
