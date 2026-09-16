import LazyDmsPresenceEditModal from "../../components/table-view/PresenceEditModal.vue";
import type { PresenceEditActor } from "../../components/table-view/PresenceEditModal.vue";

export function usePresenceEditWarning() {
  const overlay = useOverlay();

  async function warnBeforeEdit(
    editors: PresenceEditActor[],
  ): Promise<boolean> {
    const modal = overlay.create(LazyDmsPresenceEditModal, {
      props: { editors },
    });

    const result = await modal.open();
    return result === true;
  }

  return { warnBeforeEdit };
}
