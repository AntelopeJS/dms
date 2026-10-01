import LazyDmsConfirmModal from "../../components/confirm/ConfirmModal.vue";
import type { ConfirmOptions } from "./types";

/**
 * Opens the DMS confirmation modal.
 *
 * @returns `confirm(options)`, resolving `true` when the user confirmed.
 */
export function useConfirm() {
  const overlay = useOverlay();

  async function confirm(options: ConfirmOptions): Promise<boolean> {
    const modal = overlay.create(LazyDmsConfirmModal, {
      props: options,
    });

    const result = await modal.open();
    return result === true;
  }

  return { confirm };
}
