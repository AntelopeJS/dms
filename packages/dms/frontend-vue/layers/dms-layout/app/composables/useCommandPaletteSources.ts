import type {
  CommandPaletteGroup,
  CommandPaletteItem,
  DashboardSearchProps,
} from "@nuxt/ui";

/**
 * A contributor of command-palette (Ctrl/Cmd+K) groups. Like
 * {@link HeaderAction}, sources live in keyed DMS app state so any module's
 * layer can register one without a build-time dependency on this layer.
 *
 * Because sources carry callables (`groups`, item `onSelect`), they must be
 * registered from CLIENT context (a `.client` plugin or component setup):
 * function values are not part of the SSR payload, so a server-side
 * registration would arrive on the client stripped. `useCommandPaletteGroups`
 * defensively drops such entries, so a stray server-side registration
 * degrades to "commands not shown" rather than a runtime crash.
 */
export interface CommandPaletteSource {
  /** Unique key: dedup on `register` (upsert) and target of `unregister`. */
  id: string;
  /**
   * Position of this source's groups relative to other sources, ascending.
   * Defaults to `100`; sources sharing the same effective order preserve
   * registration order. Applies to the initial (empty-search) view — while
   * the user types, the palette reorders groups by match relevance.
   */
  order?: number;
  /**
   * Builds the groups this source contributes. Evaluated inside a `computed`,
   * so any reactive state read here updates the palette automatically.
   * Return `[]` when there is nothing to show. Prefix group ids with the
   * source id: ids are global to the palette and a collision silently merges
   * the colliding groups' items under the first group's header.
   */
  groups: () => CommandPaletteGroup[];
}

const COMMAND_PALETTE_SOURCES_STATE_KEY = "dms:command-palette-sources";
const DEFAULT_SOURCE_ORDER = 100;

/**
 * Item field the palette search indexes but never renders. Sources set it to
 * make an entry reachable through text that has no place on the item itself —
 * a page description, alternate wordings — while `label` and `suffix` keep
 * driving what the user sees.
 */
export const COMMAND_PALETTE_SEARCH_TEXT_KEY = "searchText";

const SEARCH_TEXT_WEIGHT = 0.3;

/**
 * Fuse configuration handed to `UDashboardSearch`, merged by `defu` into the
 * component's own defaults. That merge concatenates `keys`, so listing the
 * built-in `label` and `suffix` here would index them twice: only the extra key
 * belongs in this list. Its low weight keeps a page matched on its search text
 * alone behind pages whose title or breadcrumb matches.
 */
export const COMMAND_PALETTE_FUSE_OPTIONS: DashboardSearchProps["fuse"] = {
  fuseOptions: {
    keys: [
      { name: COMMAND_PALETTE_SEARCH_TEXT_KEY, weight: SEARCH_TEXT_WEIGHT },
    ],
  },
};

interface CommandPaletteSearchMatch {
  key?: string;
}

function isSearchTextMatch(match: CommandPaletteSearchMatch): boolean {
  return match.key === COMMAND_PALETTE_SEARCH_TEXT_KEY;
}

function withoutSearchTextMatches(
  item: CommandPaletteItem,
): CommandPaletteItem {
  const matches = item.matches as CommandPaletteSearchMatch[] | undefined;
  if (!matches?.some(isSearchTextMatch)) {
    return item;
  }

  return {
    ...item,
    matches: matches.filter((match) => !isSearchTextMatch(match)),
  };
}

/**
 * Drops {@link COMMAND_PALETTE_SEARCH_TEXT_KEY} matches from a group's items
 * before the palette renders them. Nuxt UI displays the first match whose key
 * is not the label as the item suffix, so a hit on the hidden search text would
 * replace the breadcrumb with an excerpt of that text.
 */
export function hideSearchTextMatches(
  group: CommandPaletteGroup,
): CommandPaletteGroup {
  const { postFilter } = group;

  return {
    ...group,
    postFilter: (searchTerm, items) =>
      (postFilter?.(searchTerm, items) ?? items).map(withoutSearchTextMatches),
  };
}

function sourceOrder(source: CommandPaletteSource): number {
  return source.order ?? DEFAULT_SOURCE_ORDER;
}

function isSourceRenderable(source: CommandPaletteSource): boolean {
  return typeof source.groups === "function";
}

function useCommandPaletteSourceState() {
  return useDmsState<CommandPaletteSource[]>(
    COMMAND_PALETTE_SOURCES_STATE_KEY,
    () => [],
  );
}

export function registerCommandPaletteSource(
  source: CommandPaletteSource,
): void {
  const sources = useCommandPaletteSourceState();
  const next = sources.value.filter((entry) => entry.id !== source.id);
  next.push(source);
  sources.value = next;
}

export function unregisterCommandPaletteSource(id: string): void {
  const sources = useCommandPaletteSourceState();
  sources.value = sources.value.filter((entry) => entry.id !== id);
}

function safeSourceGroups(source: CommandPaletteSource): CommandPaletteGroup[] {
  try {
    return source.groups();
  } catch (error) {
    console.error(
      `[command-palette] source "${source.id}" failed to build groups`,
      error,
    );
    return [];
  }
}

/**
 * Aggregated groups from every registered {@link CommandPaletteSource},
 * ordered by source `order`. A source whose `groups` getter throws is
 * skipped so it cannot take the other sources down with it. Every group goes
 * through {@link hideSearchTextMatches}, so a source can set
 * {@link COMMAND_PALETTE_SEARCH_TEXT_KEY} without minding the rendering. Fed to
 * `UDashboardSearch` by the DMS; consumers normally only need
 * `registerCommandPaletteSource`.
 */
export function useCommandPaletteGroups() {
  const sources = useCommandPaletteSourceState();

  const orderedSources = computed<CommandPaletteSource[]>(() =>
    sources.value
      .filter(isSourceRenderable)
      .sort((a, b) => sourceOrder(a) - sourceOrder(b)),
  );

  const groups = computed<CommandPaletteGroup[]>(() =>
    orderedSources.value.flatMap(safeSourceGroups).map(hideSearchTextMatches),
  );

  return { groups };
}
