import { computed, ref, type Ref } from "vue";
import type { MockupDataMode, MockupPageState } from "../../utils/mockup";
import {
  FIXTURES_ONLY_QUERY,
  FIXTURES_ONLY_VALUE,
} from "../../utils/previewFixturesOnly";

const PREVIEW_PATH = "/dms-preview";

/**
 * Whether the page on screen reads its live routes, and the preview frame's
 * document for it. A page converted from a live page reads them unless the
 * developer turns Real data off; any other page reads its fixtures alone, on
 * a document that refuses every live route. Switching Real data replaces the
 * frame, so no tree is drawn in the document of the other mode.
 */
export function useMockupRealData(
  currentPage: Readonly<Ref<MockupPageState | undefined>>,
  initial: MockupDataMode | undefined,
) {
  const choice = ref(initial);
  const hasRealData = computed(() => currentPage.value?.realTree !== undefined);
  const realData = computed({
    get: () =>
      hasRealData.value &&
      (choice.value
        ? choice.value === "real"
        : currentPage.value?.livePage !== undefined),
    set: (isOn: boolean) => {
      choice.value = isOn ? "real" : "sample";
    },
  });
  const previewSrc = computed(() =>
    realData.value
      ? PREVIEW_PATH
      : `${PREVIEW_PATH}?${FIXTURES_ONLY_QUERY}=${FIXTURES_ONLY_VALUE}`,
  );
  return { hasRealData, realData, previewSrc };
}
