/**
 * Demo of the command palette's assistant mode. Registering an assistant adds
 * the Tab toggle, the "Ask the assistant" item under every search, and the
 * suggestions below; `PaletteAssistantDemoAnswer` answers a submitted prompt
 * by echoing it after a short delay, so the loading skeleton shows first.
 *
 * Client-only: `suggestions` is a function, which the SSR payload would drop.
 */
interface DemoSuggestion {
  key: string;
  icon?: string;
  /** Submits a prompt other than the label shown. */
  hasPrompt?: boolean;
}

const SUGGESTIONS: DemoSuggestion[] = [
  { key: "churn", icon: "i-ph-chart-line-down" },
  { key: "block", icon: "i-ph-cube" },
  { key: "order", hasPrompt: true },
];

export default defineDmsPlugin(({ $i18n }) => {
  registerCommandPaletteAssistant({
    id: "demo:assistant",
    label: "$demo.assistant.label",
    icon: "i-ph-sparkle",
    placeholder: "$demo.assistant.placeholder",
    suggestions: () =>
      SUGGESTIONS.map(({ key, icon, hasPrompt }) => ({
        label: `$demo.assistant.suggestions.${key}`,
        icon,
        prompt: hasPrompt
          ? $i18n.t(`demo.assistant.prompts.${key}`)
          : undefined,
      })),
    answerComponent: "PaletteAssistantDemoAnswer",
  });
});
