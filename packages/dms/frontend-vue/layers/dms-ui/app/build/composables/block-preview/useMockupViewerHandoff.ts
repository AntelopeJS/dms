import type { Ref } from "vue";
import type { MockupPageState } from "../../utils/mockup";
import { blockName, nodeLabel } from "../../utils/mockupOutline";
import { layoutPathOf, nodeAt } from "../../utils/mockupSpec";
import type { MockupSpecDocument } from "../../utils/mockupSpec";
import { useMockupAssistantRuns } from "./useMockupAssistantRuns";
import type { MockupCatalog } from "./useMockupCatalog";
import { useMockupHandoff } from "./useMockupHandoff";

interface ViewerHandoffOptions {
  name: string;
  /** The mockup's title as the viewer shows it now. */
  title: () => string;
  spec: Readonly<Ref<MockupSpecDocument | undefined>>;
  currentPage: Readonly<Ref<MockupPageState | undefined>>;
  catalog: MockupCatalog;
  isOverview: Readonly<Ref<boolean>>;
}

/**
 * What the viewer asks of the DMS assistant: build the mockup, or the live
 * page a converted page names, resolve the open comments of the page on
 * screen or of every page, and write a block's custom zone. Each is a
 * request to the handoff, and the runs follow the assistant's answers.
 */
export function useMockupViewerHandoff(options: ViewerHandoffOptions) {
  const { t } = useI18n();
  const handoff = useMockupHandoff({
    mockup: options.name,
    title: options.title,
    command: (mockup, request) => {
      const name =
        mockup.title === undefined
          ? mockup.name
          : t("dms.mockup.prompt_mockup_titled", {
              title: mockup.title,
              name: mockup.name,
            });
      if (request.source === "resolve-comments") {
        return t("dms.mockup.prompt_resolve_comments", { name });
      }
      return request.target
        ? t("dms.mockup.prompt_build_page", {
            name,
            ref: request.target.pageRef,
          })
        : t("dms.mockup.prompt_build", { name });
    },
  });
  const runs = useMockupAssistantRuns(options.name);

  function blockOf(pointer: string) {
    const spec = options.spec.value;
    const node = spec ? nodeAt(spec, pointer) : undefined;
    const page = options.currentPage.value;
    if (!node || !page || !spec) return undefined;
    const label = nodeLabel(node, options.catalog.byType.value);
    const values = {
      mockup: options.name,
      page: page.title,
      block: blockName(node, options.catalog.byType.value),
      label,
    };
    return {
      source: "custom-zone" as const,
      prompt: t("dms.mockup.prompt_custom_zone", values),
      block: {
        mockup: options.name,
        page: page.id,
        path: layoutPathOf(spec, pointer) ?? "",
        type: node.type,
      },
    };
  }

  return {
    handoff,
    runs,
    /** Asks the assistant to build the custom zone of the block at the spec's `pointer`. */
    handOff(pointer: string): void {
      const request = blockOf(pointer);
      if (request) handoff.request(request);
    },
    build(): void {
      const livePage = options.currentPage.value?.livePage;
      handoff.request({
        source: "build",
        ...(livePage && { target: { pageRef: livePage.ref } }),
      });
    },
    resolveComments(): void {
      const page = options.isOverview.value
        ? undefined
        : options.currentPage.value?.id;
      handoff.request({
        source: "resolve-comments",
        ...(page !== undefined && { page }),
      });
    },
  };
}
