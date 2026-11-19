/**
 * The event the dev-only `/mockup` editor dispatches on `window` to hand a
 * request to the DMS assistant: connect a block to real data, change a custom
 * zone, build the mockup, or resolve its open comments. It is cancelable, and the assistant chat claims
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
 * What a request comes from: a custom zone's "Ask the AI to change it", the
 * editor's "Build it", its "Resolve with AI" over the open comments, or the
 * Mockups page's "New mockup" card.
 */
export type MockupAssistantPromptSource =
  | "custom-zone"
  | "build"
  | "resolve-comments"
  | "new-mockup";

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

export interface MockupAssistantPromptTarget {
  /** The page's builder ref: build into that page, never a new one. */
  pageRef: string;
}

/** The `detail` of a {@link MOCKUP_ASSISTANT_PROMPT_EVENT} event. */
export interface MockupAssistantPrompt {
  /**
   * What to ask: a full sentence for `custom-zone`; the
   * mockup's name alone for `build` and `resolve-comments`, whose request the
   * chat writes itself; for `new-mockup`, the starter of a request in the
   * user's language ("Draft a mockup of "), to put in the composer of a new
   * conversation for the user to finish.
   */
  prompt: string;
  /**
   * The mockup's title, for `build` and `resolve-comments`, when it differs
   * from the name in `prompt`.
   */
  title?: string;
  /** The block the request is about; absent for `build`, `resolve-comments` and `new-mockup`. */
  block?: MockupAssistantPromptBlock;
  /** The live page a `build` updates; absent for a mockup made by hand. */
  target?: MockupAssistantPromptTarget;
  /**
   * The id of the spec page on screen, for `resolve-comments`: every open
   * comment of the mockup is to resolve, and this page is the one in view.
   */
  page?: string;
  source: MockupAssistantPromptSource;
}

/**
 * The event the DMS assistant dispatches on `window` when a run it makes for
 * a mockup starts, and again when it ends: a build, or a resolve of the open
 * comments. While one runs, the editor's "Build it" or "Resolve with AI"
 * reads that it does, and a click still dispatches
 * {@link MOCKUP_ASSISTANT_PROMPT_EVENT}, which opens the conversation.
 *
 * ```typescript
 * window.dispatchEvent(
 *   new CustomEvent(MOCKUP_ASSISTANT_RUN_EVENT, {
 *     detail: { mockup: "shop-admin", source: "build", running: true },
 *   }),
 * );
 * ```
 */
export const MOCKUP_ASSISTANT_RUN_EVENT = "dms:assistant-run";

/**
 * The event the editor dispatches on `window`, without a detail, once it is
 * mounted: the assistant answers with a {@link MOCKUP_ASSISTANT_RUN_EVENT}
 * whose `running` is true for each run going on.
 */
export const MOCKUP_ASSISTANT_RUN_QUERY_EVENT = "dms:assistant-run-query";

/** What a run of the assistant does for a mockup. */
export type MockupAssistantRunSource = Extract<
  MockupAssistantPromptSource,
  "build" | "resolve-comments"
>;

/** The `detail` of a {@link MOCKUP_ASSISTANT_RUN_EVENT} event. */
export interface MockupAssistantRun {
  /** The mockup's name, its folder under `mockups/`. */
  mockup: string;
  source: MockupAssistantRunSource;
  /** True when the run starts, false when it ends. */
  running: boolean;
}
