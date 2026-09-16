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
      successMessage: string;
      confirm?: {
        title: string;
        description: string;
        confirmColor?: "primary" | "error" | "warning";
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
