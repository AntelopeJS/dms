/**
 * The event the dev-only `/mockup` editor dispatches on `window` to hand a
 * request to the DMS assistant: connect a block to real data, change a custom
 * zone, or build the mockup. It is cancelable, and the assistant chat claims
 * it with `preventDefault()`; when nobody does, the editor shows the request
 * for the developer to copy into their own AI tool.
 *
 * ```typescript
 * window.addEventListener(MOCKUP_ASSISTANT_PROMPT_EVENT, (event) => {
 *   if (!(event instanceof CustomEvent)) return;
 *   event.preventDefault();
 *   openChat(event.detail);
 * });
 * ```
 */
export const MOCKUP_ASSISTANT_PROMPT_EVENT = "dms:assistant-prompt";

/**
 * What a request comes from: the Data card's "Connect data with the AI", a
 * custom zone's "Ask the AI to change it", or the editor's "Build it".
 */
export type MockupAssistantPromptSource =
  | "connect-data"
  | "custom-zone"
  | "build";

/** The block of a mockup page a request is about. */
export interface MockupAssistantPromptBlock {
  /** The mockup's name, its folder under `mockups/`. */
  mockup: string;
  /** The id of the spec page the block is on. */
  page: string;
  /**
   * The block's layout path in the preview's tree, as the preview reports it
   * (`block-0.kpis.revenue`): the root index, then each child's id or index.
   */
  path: string;
  /** The node's block type, or `"sketch"` for a custom zone. */
  type?: string;
}

/** The `detail` of a {@link MOCKUP_ASSISTANT_PROMPT_EVENT} event. */
export interface MockupAssistantPrompt {
  /**
   * What to ask: a full sentence for `connect-data` and `custom-zone`; the
   * mockup's name alone for `build`, whose request the chat writes itself.
   */
  prompt: string;
  /** The block the request is about; absent for `build`. */
  block?: MockupAssistantPromptBlock;
  source: MockupAssistantPromptSource;
}
