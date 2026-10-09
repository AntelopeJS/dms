import type { CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui";

/** @internal */
export const ASSISTANT_ASK_GROUP_ID = "dms-assistant-ask";
/** @internal */
export const ASSISTANT_PROMPT_GROUP_ID = "dms-assistant-prompt";
/** @internal */
export const ASSISTANT_SUGGESTIONS_GROUP_ID = "dms-assistant-suggestions";
/** @internal The hint shown on the item that Tab also reaches. */
export const ASSISTANT_MODE_KEY = "Tab";

// The assistant's items take the violet AI accent instead of the primary one,
// on the row and on its icon well.
const ASSISTANT_ITEM_CLASS = [
  "data-highlighted:before:bg-(--dms-assistant-tint)",
  "[&_[data-slot=itemLeadingIcon]]:border-(--dms-assistant-line)",
  "[&_[data-slot=itemLeadingIcon]]:bg-(--dms-assistant-tint)",
  "[&_[data-slot=itemLeadingIcon]]:text-secondary",
].join(" ");

/** @internal A suggestion with its label and prompt resolved for display. */
export interface ResolvedAssistantSuggestion {
  label: string;
  prompt: string;
  icon: string;
}

/** @internal What the search-mode "Ask the assistant" group needs. */
export interface AssistantAskGroupOptions {
  /** Group header: the assistant's resolved label. */
  label: string;
  icon: string;
  askLabel: (query: string) => string;
  onAsk: (query: string) => void;
}

/** @internal What the assistant-mode groups need. */
export interface AssistantModeGroupsOptions {
  icon: string;
  promptLabel: string;
  suggestionsLabel: string;
  sendLabel: (prompt: string) => string;
  suggestions: ResolvedAssistantSuggestion[];
  onSubmit: (prompt: string) => void;
}

function assistantItem(
  label: string,
  icon: string,
  onChoose: () => void,
): CommandPaletteItem {
  return {
    label,
    icon,
    class: ASSISTANT_ITEM_CLASS,
    // Cancelling the selection keeps the palette open: `UDashboardSearch`
    // closes on every selection that reaches its model.
    onSelect: (event: Event) => {
      event.preventDefault();
      onChoose();
    },
  };
}

function trackResults(
  group: CommandPaletteGroup,
  markResults: (count: number) => void,
): CommandPaletteGroup {
  const { postFilter } = group;

  return {
    ...group,
    postFilter: (searchTerm, items) => {
      const filtered = postFilter?.(searchTerm, items) ?? items;
      markResults(filtered.length);
      return filtered;
    },
  };
}

/**
 * Appends the "Ask the assistant “query”" group after the search groups. The
 * palette only runs a group's `postFilter` when the group has matches, and
 * runs the filter-ignoring group appended here after every matched group: the
 * ask group therefore knows whether anything matched, and hides itself when
 * nothing did, so the empty state can offer the assistant instead.
 *
 * @internal
 */
export function appendAssistantAskGroup(
  groups: CommandPaletteGroup[],
  options: AssistantAskGroupOptions,
): CommandPaletteGroup[] {
  let hasResults = false;
  const markResults = (count: number) => {
    hasResults ||= count > 0;
  };
  const askGroup: CommandPaletteGroup = {
    id: ASSISTANT_ASK_GROUP_ID,
    label: options.label,
    ignoreFilter: true,
    items: [{ label: options.label }],
    postFilter: (searchTerm) => {
      const hadResults = hasResults;
      hasResults = false;
      const query = searchTerm.trim();
      if (!hadResults || !query) return [];
      const item = assistantItem(options.askLabel(query), options.icon, () =>
        options.onAsk(query),
      );
      return [{ ...item, kbds: [ASSISTANT_MODE_KEY] }];
    },
  };

  return [...groups.map((group) => trackResults(group, markResults)), askGroup];
}

function promptGroup(
  prompt: string,
  options: AssistantModeGroupsOptions,
): CommandPaletteGroup[] {
  if (!prompt) return [];

  const item = assistantItem(options.sendLabel(prompt), options.icon, () =>
    options.onSubmit(prompt),
  );
  return [
    {
      id: ASSISTANT_PROMPT_GROUP_ID,
      label: options.promptLabel,
      ignoreFilter: true,
      items: [item],
    },
  ];
}

function suggestionsGroup(
  options: AssistantModeGroupsOptions,
): CommandPaletteGroup[] {
  if (!options.suggestions.length) return [];

  return [
    {
      id: ASSISTANT_SUGGESTIONS_GROUP_ID,
      label: options.suggestionsLabel,
      ignoreFilter: true,
      items: options.suggestions.map((suggestion) =>
        assistantItem(suggestion.label, suggestion.icon, () =>
          options.onSubmit(suggestion.prompt),
        ),
      ),
    },
  ];
}

/**
 * The groups of assistant mode: the typed prompt first, so Enter on the
 * highlighted first item sends it, then the suggestions, which stay listed
 * while the user types and are reached with the arrow keys.
 *
 * @internal
 */
export function buildAssistantModeGroups(
  prompt: string,
  options: AssistantModeGroupsOptions,
): CommandPaletteGroup[] {
  return [...promptGroup(prompt, options), ...suggestionsGroup(options)];
}
