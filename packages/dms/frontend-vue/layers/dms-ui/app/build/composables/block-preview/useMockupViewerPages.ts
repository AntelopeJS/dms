import { computed, type Ref, type ShallowRef } from "vue";
import { isString } from "../../../../../dms-core/app/utils/type-check";
import type { MockupState } from "../../utils/mockup";
import { editedIndex, type MockupSpecDocument } from "../../utils/mockupSpec";
import { useMockupRoutePage } from "./useMockupRoutePage";
import type { MockupVersions } from "./useMockupVersions";

interface ViewerPagesOptions {
  /** The mockup's folder name, its title when nothing else names one. */
  name: string;
  /** The compiled state the stream last sent. */
  state: Readonly<ShallowRef<MockupState | undefined>>;
  history: MockupVersions;
  spec: Readonly<Ref<MockupSpecDocument | undefined>>;
}

/**
 * What the viewer draws, and which page of it. The state is the previewed
 * version's, else the current one's. The URL names the page, none for the
 * Overview, which is the mockup's home: it shows while the URL names no page,
 * once there is a page to lay out. Each page opened, and each return to the
 * Overview, is a new entry of the browser's history.
 */
export function useMockupViewerPages(options: ViewerPagesOptions) {
  const { page: requestedPage, record, open } = useMockupRoutePage();
  const shown = computed(
    () => options.history.previewing.value?.state ?? options.state.value,
  );
  const pages = computed(() => shown.value?.pages ?? []);
  const currentPage = computed(
    () =>
      pages.value.find((entry) => entry.id === requestedPage.value) ??
      pages.value[0],
  );
  const isReadOnly = computed(
    () => options.history.previewing.value !== undefined,
  );
  return {
    shown,
    isReadOnly,
    /** The title of the previewed version; else the spec's, as edited now; else the compiled one, else the mockup's folder name. */
    title: computed(() => {
      if (isReadOnly.value) return shown.value?.title || options.name;
      const written = options.spec.value?.title;
      return (
        (isString(written) && written) ||
        options.state.value?.title ||
        options.name
      );
    }),
    pages,
    categories: computed(() => shown.value?.categories ?? []),
    issues: computed(() => shown.value?.issues ?? []),
    requestedPage,
    record,
    open,
    currentPage,
    isOverview: computed(
      () => requestedPage.value === undefined && pages.value.length > 0,
    ),
    /** The index of the current page in the spec. */
    pageIndex: computed(() =>
      editedIndex(options.spec.value, currentPage.value?.id),
    ),
    /** A table's generated form page: the mockup draws it, no spec page holds it, so nothing on it is edited or commented. */
    isVirtual: computed(() => currentPage.value?.generated === true),
    /** Closes the page on screen: back to the Overview, as a new entry of the browser's history. */
    close: () => open(undefined),
  };
}
