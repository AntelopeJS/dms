import type { CommandPaletteGroup } from "@nuxt/ui";
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import type { I18nTranslate } from "#dms-core/app/composables/translation/useTranslation";
import {
  appendAssistantAskGroup,
  buildAssistantModeGroups,
  type ResolvedAssistantSuggestion,
} from "./assistantGroups";

/** @internal */
export type CommandPaletteMode = "search" | "assistant";

/** @internal One submitted prompt; `id` changes on every submission. */
export interface CommandPaletteSubmission {
  id: number;
  prompt: string;
}

/** @internal The registered assistant's fields, resolved for display. */
export interface ResolvedCommandPaletteAssistant {
  label: string;
  icon: string;
  placeholder: string;
  answerComponent: string;
  suggestions: ResolvedAssistantSuggestion[];
}

interface PaletteGroupsContext {
  assistant: ResolvedCommandPaletteAssistant | undefined;
  isAssistantMode: boolean;
  hasAnswer: boolean;
  prompt: string;
  translate: I18nTranslate;
  submit: (prompt: string) => void;
}

const MODE_ANNOUNCEMENT_KEYS: Record<CommandPaletteMode, string> = {
  search: "commandPalette.assistant.modeSearch",
  assistant: "commandPalette.assistant.modeAssistant",
};

const OTHER_MODE: Record<CommandPaletteMode, CommandPaletteMode> = {
  search: "assistant",
  assistant: "search",
};

/**
 * Tab without a modifier: Shift+Tab and the browser's own combinations keep
 * moving focus, so the dialog's keyboard navigation stays reachable.
 *
 * @internal
 */
export function isModeToggleKey(event: KeyboardEvent): boolean {
  return (
    event.key === "Tab" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.isComposing
  );
}

function createModeToggleHandler(
  isEnabled: () => boolean,
  toggle: () => void,
): (event: KeyboardEvent) => void {
  return (event) => {
    if (!isEnabled() || !isModeToggleKey(event)) return;
    // The dialog's focus trap listens further up and would move focus.
    event.preventDefault();
    event.stopPropagation();
    toggle();
  };
}

function useResolvedAssistant(): ComputedRef<
  ResolvedCommandPaletteAssistant | undefined
> {
  const { assistant } = useCommandPaletteAssistant();
  const { t } = useI18n();
  const { processI18n } = useTranslation();

  return computed(() => {
    const entry = assistant.value;
    if (!entry) return undefined;

    return {
      label: processI18n(entry.label),
      icon: entry.icon,
      placeholder: entry.placeholder
        ? processI18n(entry.placeholder)
        : t("commandPalette.assistant.placeholder"),
      answerComponent: entry.answerComponent,
      suggestions: entry.suggestions().map((suggestion) => {
        const label = processI18n(suggestion.label);
        return {
          label,
          prompt: suggestion.prompt ?? label,
          icon: suggestion.icon ?? entry.icon,
        };
      }),
    };
  });
}

function useAssistantSession(
  isOpen: Ref<boolean>,
  searchTerm: Ref<string>,
  hasAssistant: ComputedRef<boolean>,
) {
  const { t } = useI18n();
  const mode = ref<CommandPaletteMode>("search");
  const submission = ref<CommandPaletteSubmission | null>(null);
  const announcement = ref("");
  let submissionCount = 0;

  function setMode(next: CommandPaletteMode): void {
    if (!hasAssistant.value) return;
    mode.value = next;
    submission.value = null;
    announcement.value = t(MODE_ANNOUNCEMENT_KEYS[next]);
  }

  function submit(prompt: string): void {
    const trimmed = prompt.trim();
    if (!trimmed || !hasAssistant.value) return;
    mode.value = "assistant";
    searchTerm.value = trimmed;
    submissionCount += 1;
    submission.value = { id: submissionCount, prompt: trimmed };
  }

  watch(isOpen, (open) => {
    if (open) return;
    mode.value = "search";
    submission.value = null;
    announcement.value = "";
  });
  const onInputKeydown = createModeToggleHandler(
    () => hasAssistant.value,
    () => setMode(OTHER_MODE[mode.value]),
  );

  return { mode, submission, announcement, setMode, submit, onInputKeydown };
}

/** The submission whose answer shows: gone as soon as the prompt is edited. */
function useShownAnswer(
  isAssistantMode: ComputedRef<boolean>,
  submission: Ref<CommandPaletteSubmission | null>,
  searchTerm: Ref<string>,
): ComputedRef<CommandPaletteSubmission | null> {
  return computed(() =>
    isAssistantMode.value &&
    submission.value?.prompt === searchTerm.value.trim()
      ? submission.value
      : null,
  );
}

function assistantModeGroups(
  assistant: ResolvedCommandPaletteAssistant,
  context: PaletteGroupsContext,
): CommandPaletteGroup[] {
  if (context.hasAnswer) return [];

  return buildAssistantModeGroups(context.prompt, {
    icon: assistant.icon,
    promptLabel: assistant.label,
    suggestionsLabel: context.translate(
      "commandPalette.assistant.suggestions",
      {},
    ),
    sendLabel: (prompt) =>
      context.translate("commandPalette.assistant.send", { prompt }),
    suggestions: assistant.suggestions,
    onSubmit: context.submit,
  });
}

/**
 * The groups the palette renders: the sources' groups untouched while no
 * assistant is registered, the same groups followed by the "Ask the
 * assistant" item in search mode, and the prompt and suggestions in assistant
 * mode — none once an answer is shown, which the empty slot renders.
 *
 * @internal
 */
export function buildPaletteGroups(
  sourceGroups: CommandPaletteGroup[],
  context: PaletteGroupsContext,
): CommandPaletteGroup[] {
  const { assistant } = context;
  if (!assistant) return sourceGroups;
  if (context.isAssistantMode) return assistantModeGroups(assistant, context);

  return appendAssistantAskGroup(sourceGroups, {
    label: assistant.label,
    icon: assistant.icon,
    askLabel: (query) =>
      context.translate("commandPalette.assistant.ask", { query }),
    onAsk: context.submit,
  });
}

/**
 * State of the command palette's assistant mode: the mode, the groups shown
 * for it, the submitted prompt, and the Tab toggle bound to the input. Every
 * piece degrades to the plain search palette while no assistant is registered.
 *
 * @internal
 */
export function useCommandPaletteAssistantMode(
  searchGroups: Ref<CommandPaletteGroup[]>,
) {
  const { t } = useI18n();
  const isOpen = ref(false);
  const searchTerm = ref("");
  const assistant = useResolvedAssistant();
  const hasAssistant = computed(() => !!assistant.value);
  const session = useAssistantSession(isOpen, searchTerm, hasAssistant);
  const { mode, submission } = session;

  const isAssistantMode = computed(
    () => hasAssistant.value && mode.value === "assistant",
  );
  const answer = useShownAnswer(isAssistantMode, submission, searchTerm);
  const groups = computed(() =>
    buildPaletteGroups(searchGroups.value, {
      assistant: assistant.value,
      isAssistantMode: isAssistantMode.value,
      hasAnswer: !!answer.value,
      prompt: searchTerm.value.trim(),
      translate: (key, params) => t(key, params),
      submit: session.submit,
    }),
  );

  return {
    ...session,
    isOpen,
    searchTerm,
    assistant,
    isAssistantMode,
    answer,
    groups,
  };
}
