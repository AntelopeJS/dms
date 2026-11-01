import { vi } from "vitest";
import type { Component } from "vue";
import { useRealDataEngine } from "../fixtures/dataEngine";
import { Color } from "../../layers/dms-core/app/types/color";
import { HttpMethod } from "../../layers/dms-core/app/types/http";
import { interpolateUrl } from "../../layers/dms-core/app/utils/url-interpolation";
import { useApiError } from "../../layers/dms-core/app/composables/useApiError";
import { useConfirm } from "../../layers/dms-ui/app/composables/confirm/useConfirm";
import type { ConfirmOptions } from "../../layers/dms-ui/app/composables/confirm/types";
import { useModal } from "../../layers/dms-ui/app/composables/containers/useModal";
import { useDrawer } from "../../layers/dms-ui/app/composables/containers/useDrawer";
import { useExportJob } from "../../layers/dms-ui/app/composables/useExportJob";

export function stubMiscActions() {
  useRealDataEngine();
  vi.stubGlobal("Color", Color);
  vi.stubGlobal("HttpMethod", HttpMethod);
  vi.stubGlobal("interpolateUrl", interpolateUrl);
  vi.stubGlobal("useToast", () => ({ add: vi.fn(() => ({ id: "failure" })) }));
  vi.stubGlobal("useModal", useModal);
  vi.stubGlobal("useDrawer", useDrawer);
  vi.stubGlobal("useExportJob", useExportJob);
  vi.stubGlobal("useApiError", useApiError);
  vi.stubGlobal("useConfirm", useConfirm);
  vi.stubGlobal("useOverlay", () => ({
    create: (_component: Component, { props }: { props: ConfirmOptions }) => ({
      open: async () => {
        await props.onConfirm?.({});
        return true;
      },
    }),
  }));
}
