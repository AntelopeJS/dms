import { ref, shallowRef, type Ref } from "vue";
import type {
  MockupAssistantPromptBlock,
  MockupAssistantPromptTarget,
} from "../../../utils/mockupAssistant";
import { dispatchMockupAssistantPrompt } from "../../utils/mockupHandoff";

/** What the editor hands the AI: a request about a custom zone, a build, or the open comments to resolve. */
export type MockupHandoffRequest =
  | {
      source: "custom-zone";
      prompt: string;
      block: MockupAssistantPromptBlock;
    }
  | { source: "build"; target?: MockupAssistantPromptTarget }
  | { source: "resolve-comments"; page?: string };

/** The full command the developer copies for a request that names the mockup alone. */
type MockupCommand = Extract<
  MockupHandoffRequest,
  { source: "build" | "resolve-comments" }
>;

/** The mockup a request names: its folder name, and its title when that differs. */
export interface HandoffMockup {
  name: string;
  title?: string;
}

/** The request the developer copies when no assistant claimed it. */
export interface MockupHandoff {
  /** The text the copy modal shows; undefined while it is closed. */
  fallback: Ref<string | undefined>;
  /** Whether the last request went unclaimed: no assistant listens here. */
  isUnclaimed: Ref<boolean>;
  request: (request: MockupHandoffRequest) => void;
}

/**
 * Hands requests to the DMS assistant: each one is dispatched as a
 * `dms:assistant-prompt` event, and when nobody claims it, the copy modal
 * opens with what the developer would type into their own AI tool. A build,
 * and a request to resolve the open comments, hand the assistant the
 * mockup's name, and its title when that differs, which the chat writes its
 * request from; their copy is the full command.
 */
export function useMockupHandoff(options: {
  mockup: string;
  /** The mockup's title as the viewer shows it now. */
  title: () => string;
  command: (mockup: HandoffMockup, request: MockupCommand) => string;
}): MockupHandoff {
  const fallback = shallowRef<string>();
  const isUnclaimed = ref(false);

  function named(): HandoffMockup {
    const title = options.title();
    return title === options.mockup
      ? { name: options.mockup }
      : { name: options.mockup, title };
  }

  function claimed(next: MockupHandoffRequest, mockup: HandoffMockup): boolean {
    const asked = {
      prompt: mockup.name,
      ...(mockup.title !== undefined && { title: mockup.title }),
    };
    switch (next.source) {
      case "build":
        return dispatchMockupAssistantPrompt({
          ...asked,
          source: "build",
          ...(next.target && { target: next.target }),
        });
      case "resolve-comments":
        return dispatchMockupAssistantPrompt({
          ...asked,
          source: "resolve-comments",
          ...(next.page !== undefined && { page: next.page }),
        });
      default:
        return dispatchMockupAssistantPrompt({
          prompt: next.prompt,
          block: next.block,
          source: next.source,
        });
    }
  }

  function request(next: MockupHandoffRequest): void {
    const mockup = named();
    isUnclaimed.value = !claimed(next, mockup);
    if (!isUnclaimed.value) return;
    fallback.value =
      next.source === "build" || next.source === "resolve-comments"
        ? options.command(mockup, next)
        : next.prompt;
  }

  return { fallback, isUnclaimed, request };
}
