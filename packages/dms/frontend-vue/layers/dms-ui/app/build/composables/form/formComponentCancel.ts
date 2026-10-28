import { computed, onMounted, ref } from "vue";
import { isString } from "#dms-core/app/utils/type-check";
import type { FormProps } from "../../../composables/form/types/props";
import type { DmsContainerContext } from "../containers/context";

interface FormCancelSource {
  inFormContainer: boolean;
  container: DmsContainerContext | undefined;
  backTo: () => FormProps["backTo"];
  isDirty: () => boolean;
  discardChanges: () => void;
  back: () => void;
  navigate: () => void;
}

function previousAppPage(): string | undefined {
  const back: unknown = window.history.state?.back;
  return isString(back) ? back : undefined;
}

/** Cancels into the container, app history, or configured fallback after discarding. */
export function formComponentCancel(source: FormCancelSource) {
  const cameFromAppPage = ref(false);
  onMounted(() => {
    cameFromAppPage.value = !!previousAppPage();
  });
  const canCancel = computed(
    () =>
      source.inFormContainer ||
      !!source.container ||
      !!source.backTo() ||
      cameFromAppPage.value,
  );

  function cancelForm(): void {
    if (source.isDirty()) source.discardChanges();
    if (source.container) {
      void source.container.close();
      return;
    }
    if (previousAppPage()) {
      source.back();
      return;
    }
    source.navigate();
  }

  return { canCancel, cancelForm };
}
