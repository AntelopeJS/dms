import { computed, ref, type Ref } from "vue";
import type { MockupDataMode, MockupPageState } from "../../utils/mockup";
import {
  mockupPreviewPath,
  readsRealData,
} from "../../utils/mockupRealData";

/**
 * Whether the page on screen reads its live routes, and the preview frame's
 * document for it. A page converted from a live page reads them unless the
 * developer turns Real data off; any other page reads its fixtures alone, on
 * a document that refuses every live route. Switching Real data replaces the
 * frame, so no tree is drawn in the document of the other mode. On the
 * Overview the switch covers every page of the board, which draws each by the
 * same rule through `choice`.
 */
export function useMockupRealData(
  currentPage: Readonly<Ref<MockupPageState | undefined>>,
  pages: Readonly<Ref<readonly MockupPageState[]>>,
  isOverview: Readonly<Ref<boolean>>,
  initial: MockupDataMode | undefined,
) {
  const choice = ref(initial);
  const shown = computed(() =>
    isOverview.value
      ? pages.value
      : currentPage.value
        ? [currentPage.value]
        : [],
  );
  const hasRealData = computed(() =>
    shown.value.some((page) => page.realTree !== undefined),
  );
  const realData = computed({
    get: () => shown.value.some((page) => readsRealData(page, choice.value)),
    set: (isOn: boolean) => {
      choice.value = isOn ? "real" : "sample";
    },
  });
  const previewSrc = computed(() =>
    mockupPreviewPath(readsRealData(currentPage.value, choice.value)),
  );
  return { choice, hasRealData, realData, previewSrc };
}
