import DynamicModal from "../../build/components/containers/modal/DynamicModal.vue";
import { openDynamicContainer } from "./openDynamicContainer";
import type { ContainerInstance, ModalOptions } from "./types";

const MODAL_ID_PREFIX = "modal";

/**
 * Public composable to open a DMS-themed modal from any module that extends the
 * layer. Wraps the internal DynamicModal container; `open` returns a handle
 * whose `result` settles when the modal is dismissed.
 */
export function useModal() {
  const overlay = useOverlay();

  function open<Result = unknown>(
    options: ModalOptions,
  ): ContainerInstance<Result> {
    return openDynamicContainer<Result, ModalOptions>(
      overlay,
      DynamicModal,
      MODAL_ID_PREFIX,
      options,
    );
  }

  return { open };
}
