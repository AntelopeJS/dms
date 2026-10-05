export type ActionTarget =
  | {
      type: "drawer";
      component: ComponentInfo;
      title?: string;
      description?: string;
    }
  | {
      type: "modal";
      size?: ModalSize;
      component: ComponentInfo;
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
