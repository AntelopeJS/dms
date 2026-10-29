import type { PlaygroundFeature } from "./types";
import {
  feature,
  KEY_VALUE,
  SETTINGS,
  MULTI_COMPONENT,
  FEEDBACK,
  CODE,
  HSTACK,
  GUARD,
  GRID_STACKED,
  GRID_SPACER,
  GRID_HYBRID,
  GRID_SIMPLE,
  GRID_DENSE,
  VSTACK,
  SPACER,
  STACK_COMBINED,
  TABS_BASIC,
  TABS_VARIANTS,
  TABS_KEEP_ALIVE,
  TABS_PERSIST,
  TABS_COUNTS,
  RECORD,
} from "./blocks-data";

export const CONTAINER_FEATURES: PlaygroundFeature[] = [
  feature(
    "Card with title, count, description, actions and footer",
    "Card({ title, count, description, actions, footer })",
    KEY_VALUE,
    "0.6.0",
  ),
  feature("Elevated card", 'Card({ variant: "elevated" })', KEY_VALUE, "0.6.0"),
  feature(
    "Blocks in the card's actions slot",
    ".child(id, block, { slot: CARD_ACTIONS_SLOT })",
    KEY_VALUE,
    "0.6.0",
  ),
  feature(
    "Blocks in the card's footer slot",
    ".child(id, block, { slot: CARD_FOOTER_SLOT })",
    KEY_VALUE,
    "0.6.0",
  ),
  feature(
    "Settings section and danger zone",
    "Section({ title, description, danger })",
    SETTINGS,
    "0.6.0",
  ),
  feature(
    "Section without a card",
    "Section({ card: false })",
    SETTINGS,
    "0.6.0",
  ),
  feature(
    "Field row layouts form and stack",
    "FieldRow({ layout })",
    SETTINGS,
    "0.6.0",
  ),
  feature(
    "Required and disabled field rows",
    "FieldRow({ required, disabled })",
    SETTINGS,
    "0.6.0",
  ),
  feature(
    "Field row without a label spanning both columns",
    'FieldRow({ layout: "form" })',
    SETTINGS,
    "0.7.8",
  ),
  feature(
    "Several blocks on one page",
    "static blocks of a PageController",
    MULTI_COMPONENT,
  ),
];

export const EMPTY_AND_CODE_FEATURES: PlaygroundFeature[] = [
  feature(
    "Empty state variants: no-data, no-result, no-access, error",
    "EmptyState({ variant })",
    FEEDBACK,
    "0.6.0",
  ),
  feature(
    "Empty state icon, tone, hatch and sizes",
    "EmptyState({ icon, tone, hatched, size })",
    FEEDBACK,
    "0.6.0",
  ),
  feature("Empty state actions", "EmptyState({ actions })", FEEDBACK, "0.6.0"),
  feature(
    "Empty state inside a card",
    "EmptyState({ card: false })",
    FEEDBACK,
    "0.6.0",
  ),
  feature(
    "Empty state with a snippet",
    "EmptyState({ code: { content, language, copy } })",
    CODE,
    "0.7.2",
  ),
  feature("Code block languages", "CodeBlock({ language })", CODE, "0.7.2"),
  feature(
    "Code block without copy button",
    "CodeBlock({ copy: false })",
    CODE,
    "0.7.2",
  ),
  feature(
    "Code block max lines and wrap",
    "CodeBlock({ maxLines, wrap })",
    CODE,
    "0.7.2",
  ),
  feature(
    "Code snippet read from a route",
    "CodeBlock({ fetchUrl })",
    CODE,
    "0.7.2",
  ),
  feature(
    "Composed code block title",
    "CodeBlock({ title: { key, params } })",
    CODE,
    "0.7.2",
  ),
  feature("Placeholder box", "Placeholder({ label, height, width })", HSTACK),
];

export const GUARD_FEATURES: PlaygroundFeature[] = [
  feature(
    "Empty state in place of blocks while a value is empty",
    "Guard({ fetchUrl, field })",
    GUARD,
    "0.7.10",
  ),
  feature(
    "Guard fallback and route emptyState overlay",
    "Guard({ fallback }), answer { emptyState }",
    GUARD,
    "0.7.10",
  ),
  feature(
    "Guard on a whole empty answer, default fallback",
    "Guard({ fetchUrl })",
    GUARD,
    "0.7.10",
  ),
  feature(
    "Not found in place of a deleted record's blocks",
    'Guard({ when: "notFound" })',
    `${GUARD}?record=gone`,
    "0.7.10",
  ),
  feature(
    "Guard URL token, children shown while unset",
    'Guard({ fetchUrl: "...{{query.record}}" })',
    GUARD,
    "0.7.10",
  ),
  feature(
    "Several guarded children spaced like page blocks",
    "Guard().child().child()",
    GUARD,
    "0.7.11",
  ),
];

export const LAYOUT_FEATURES: PlaygroundFeature[] = [
  feature(
    "Grid rows of blocks",
    "Grid({ gap }).child(id, GridRow())",
    GRID_STACKED,
  ),
  feature("Wide cells", "GridRow().child(id, block, { colSpan })", GRID_SPACER),
  feature(
    "Spacer cell in a grid row",
    "GridRow().child(id, Spacer())",
    GRID_SPACER,
  ),
  feature("Nested grids", "Grid inside a GridRow cell", GRID_HYBRID),
  feature("Grid with tabs beside a list", "Grid + Tab", GRID_SIMPLE),
  feature(
    "Columns wrapping below a minimum width",
    "Grid({ minColumnWidth })",
    GRID_DENSE,
  ),
  feature("Six KPI cards on one row", "GridRow with six KpiCards", GRID_DENSE),
  feature(
    "Horizontal stack alignment and spacing",
    "HStack({ alignment, spacing })",
    HSTACK,
  ),
  feature("Horizontal distributions", "HStack({ distribution })", HSTACK),
  feature("Wrapping horizontal stack", "HStack({ wrap: true })", HSTACK),
  feature("Vertical stack alignment", "VStack({ alignment })", VSTACK),
  feature("Vertical distributions", "VStack({ distribution })", VSTACK),
  feature("Spacer filling the free space", "Spacer()", SPACER),
  feature("Spacer size bounds", "Spacer({ minSize, maxSize })", SPACER),
  feature("Spacers sharing space by weight", "Spacer({ grow })", SPACER),
  feature(
    "Page layout from stacks only",
    "HStack + VStack + Spacer",
    STACK_COMBINED,
  ),
];

export const TAB_FEATURES: PlaygroundFeature[] = [
  feature(
    "Tabs holding blocks per slot",
    "Tab({ items: [{ label, icon, slot }] })",
    TABS_BASIC,
  ),
  feature("Keyboard shortcut per tab", "items: [{ shortcut }]", TABS_BASIC),
  feature("Disabled tab", "items: [{ disabled: true }]", TABS_VARIANTS),
  feature(
    "Pill and link variants",
    "Tab({ variant: TabVariant.pill })",
    TABS_VARIANTS,
  ),
  feature(
    "Vertical tabs, sizes and colours",
    "Tab({ orientation, size, color })",
    TABS_VARIANTS,
  ),
  feature("Badges: number, text, styled", "items: [{ badge }]", TABS_VARIANTS),
  feature(
    "Badge as an i18n key or a composed count",
    "items: [{ badge: { key, params } }]",
    TABS_VARIANTS,
    "0.7.12",
  ),
  feature("Avatar on a tab", "items: [{ avatar }]", TABS_VARIANTS),
  feature(
    "Tabs spread over the full width",
    "Tab({ fit: true })",
    TABS_VARIANTS,
    "0.7.6",
  ),
  feature(
    "Hidden tabs kept mounted",
    "Tab({ unmountOnHide: false })",
    TABS_KEEP_ALIVE,
  ),
  feature(
    "Selected tab kept in the URL",
    "Tab({ persistState, stateKey })",
    TABS_PERSIST,
  ),
  feature(
    "Selected tab under the default ?tab= key",
    "Tab({ persistState: true })",
    TABS_PERSIST,
    "0.7.12",
  ),
  feature(
    "Tab badges read from one route",
    "Tab({ badgesUrl })",
    TABS_COUNTS,
    "0.6.0",
  ),
  feature(
    "Tab badges read for the page's record",
    'Tab({ badgesUrl: "...{{params.id}}" })',
    RECORD,
    "0.6.1",
  ),
];
