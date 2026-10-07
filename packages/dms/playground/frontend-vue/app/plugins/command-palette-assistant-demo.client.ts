/**
 * Demo of the command palette's assistant mode. Registering an assistant adds
 * the Tab toggle, the "Ask the assistant" item under every search, and the
 * suggestions below; `PaletteAssistantDemoAnswer` answers a submitted prompt
 * by echoing it after a short delay, so the loading skeleton shows first.
 *
 * Client-only: `suggestions` is a function, which the SSR payload would drop.
 */
const SUGGESTION_KEYS = ["churn", "block", "order"];

export default defineDmsPlugin(() => {
  registerCommandPaletteAssistant({
    id: "demo:assistant",
    label: "$demo.assistant.label",
    icon: "i-ph-sparkle",
    placeholder: "$demo.assistant.placeholder",
    suggestions: () =>
      SUGGESTION_KEYS.map((key) => ({
        label: `$demo.assistant.suggestions.${key}`,
      })),
    answerComponent: "PaletteAssistantDemoAnswer",
  });
});
