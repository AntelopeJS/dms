import { shallowRef, type Ref } from "vue";
import type {
  MockupAssistantPromptBlock,
  MockupAssistantPromptSource,
  MockupAssistantPromptTarget,
} from "../../../utils/mockupAssistant";
import { dispatchMockupAssistantPrompt } from "../../utils/mockupHandoff";

/** What the editor hands the AI: a request, or a request about one block. */
export type MockupHandoffRequest =
  | {
      source: Exclude<MockupAssistantPromptSource, "build">;
      prompt: string;
      block: MockupAssistantPromptBlock;
    }
  | { source: "build"; target?: MockupAssistantPromptTarget };

/** The request the developer copies when no assistant claimed it. */
export interface MockupHandoff {
  /** The text the copy modal shows; undefined while it is closed. */
  fallback: Ref<string | undefined>;
  request: (request: MockupHandoffRequest) => void;
}

/**
 * Hands requests to the DMS assistant: each one is dispatched as a
 * `dms:assistant-prompt` event, and when nobody claims it, the copy modal
 * opens with what the developer would type into their own AI tool. A build
 * hands the assistant the mockup's name, and the live page it updates when
 * the mockup page was converted from one; its copy is the full command.
 */
export function useMockupHandoff(options: {
  mockup: string;
  buildCommand: (
    mockup: string,
    target: MockupAssistantPromptTarget | undefined,
  ) => string;
}): MockupHandoff {
  const fallback = shallowRef<string>();

  function request(next: MockupHandoffRequest): void {
    const isClaimed =
      next.source === "build"
        ? dispatchMockupAssistantPrompt({
            prompt: options.mockup,
            source: "build",
            ...(next.target && { target: next.target }),
          })
        : dispatchMockupAssistantPrompt({
            prompt: next.prompt,
            block: next.block,
            source: next.source,
          });
    if (isClaimed) return;
    fallback.value =
      next.source === "build"
        ? options.buildCommand(options.mockup, next.target)
        : next.prompt;
  }

  return { fallback, request };
}
