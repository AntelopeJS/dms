import LazyDmsConfirmModal from "../../components/confirm/ConfirmModal.vue";

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: "primary" | "error" | "warning";
}

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
