/**
 * A prompt the assistant mode of the command palette offers before the user
 * types anything ("Try asking").
 */
export interface CommandPaletteAssistantSuggestion {
  /**
   * Text shown in the list. A `$`-prefixed value resolves as an i18n key
   * (`useTranslation().processI18n`).
   */
  label: string;
  /**
   * Prompt submitted when the suggestion is picked. Defaults to the resolved
   * `label`; set it when the shown text and the question differ.
   */
  prompt?: string;
  /** Icon name shown in the item's well. Defaults to the assistant's icon. */
  icon?: string;
}

/**
 * The props the palette binds to an assistant's `answerComponent`, once per
 * submitted prompt. The component is mounted afresh for every submission.
 */
export interface CommandPaletteAssistantAnswerProps {
  /** The prompt the user submitted, trimmed. */
  prompt: string;
  /**
   * Closes the palette. Call it before an action takes the user elsewhere —
   * a navigation, or a hand-off to the module's own assistant UI.
   */
  close: () => void;
}

/**
 * An assistant mode for the command palette (Ctrl/Cmd+K), provided by a
 * frontend module. While one is registered, Tab switches the palette between
 * search and assistant mode, every non-empty search ends with an
 * "Ask the assistant" item, and a submitted prompt mounts `answerComponent`
 * inside the palette. Without one, the palette has no assistant mode at all.
 *
 * The palette only frames the answer: whether it is computed inline, read-only,
 * or handed off to the module's own interface is the component's decision. An
 * `answerComponent` with an async `setup` (a top-level `await`) shows the
 * palette's loading skeleton until it resolves; one that renders right away
 * draws its own progress.
 *
 * Like {@link CommandPaletteSource}, an assistant carries a callable
 * (`suggestions`), so it must be registered from CLIENT context (a `.client`
 * plugin or component setup): a server-side registration would arrive on the
 * client stripped of it, and the palette ignores such an entry.
 */
export interface CommandPaletteAssistant {
  /** Unique key: dedup on `register` (upsert) and target of `unregister`. */
  id: string;
  /**
   * Name of the assistant, shown in the input's scope chip, the answer frame
   * and the "Ask" items. A `$`-prefixed value resolves as an i18n key.
   */
  label: string;
  /** Icon name of the assistant mode: the input's lead icon and the items' well. */
  icon: string;
  /**
   * Input placeholder in assistant mode. A `$`-prefixed value resolves as an
   * i18n key. Defaults to the DMS's "Ask anything about your workspace…".
   */
  placeholder?: string;
  /**
   * Builds the suggestions listed while the prompt is empty. Evaluated inside
   * a `computed`, so reactive state read here (the current page, the user's
   * permissions) updates the list. Return `[]` for none.
   */
  suggestions: () => CommandPaletteAssistantSuggestion[];
  /**
   * Full registered name of the global component that answers a prompt. It
   * receives {@link CommandPaletteAssistantAnswerProps}.
   */
  answerComponent: string;
}

const COMMAND_PALETTE_ASSISTANTS_STATE_KEY = "dms:command-palette-assistants";

function isAssistantRenderable(assistant: CommandPaletteAssistant): boolean {
  return (
    typeof assistant.suggestions === "function" &&
    typeof assistant.answerComponent === "string"
  );
}

function useCommandPaletteAssistantState() {
  return useDmsState<CommandPaletteAssistant[]>(
    COMMAND_PALETTE_ASSISTANTS_STATE_KEY,
    () => [],
  );
}

/**
 * Registers the command palette's assistant mode. Re-registering the same `id`
 * replaces the entry. When several modules register one, the palette uses the
 * one registered last.
 */
export function registerCommandPaletteAssistant(
  assistant: CommandPaletteAssistant,
): void {
  const assistants = useCommandPaletteAssistantState();
  const next = assistants.value.filter((entry) => entry.id !== assistant.id);
  next.push(assistant);
  assistants.value = next;
}

/** Removes the assistant registered under `id`; a no-op when there is none. */
export function unregisterCommandPaletteAssistant(id: string): void {
  const assistants = useCommandPaletteAssistantState();
  assistants.value = assistants.value.filter((entry) => entry.id !== id);
}

/**
 * The assistant the command palette offers, or `undefined` when no module
 * registered a usable one. Read by the DMS palette; modules normally only need
 * {@link registerCommandPaletteAssistant}.
 */
export function useCommandPaletteAssistant() {
  const assistants = useCommandPaletteAssistantState();

  const assistant = computed<CommandPaletteAssistant | undefined>(() =>
    assistants.value.filter(isAssistantRenderable).at(-1),
  );

  return { assistant };
}
