import type { PlaygroundFeature } from "./types";
import {
  feature,
  STAT_GROUP,
  KEY_VALUE,
  NAV_CARDS,
  ACTIVITY,
  METERS,
  SETTINGS,
  FEEDBACK,
  RECORD,
} from "./blocks-data";

export const STAT_GROUP_FEATURES: PlaygroundFeature[] = [
  feature(
    "Joined status strip",
    'StatGroup({ layout: "joined" })',
    STAT_GROUP,
    "0.6.0",
  ),
  feature(
    "Summary cards",
    'StatGroup({ layout: "cards", columns })',
    STAT_GROUP,
    "0.6.0",
  ),
  feature(
    "Accessible group label",
    "StatGroup({ label })",
    STAT_GROUP,
    "0.6.0",
  ),
  feature(
    "Well tones, muted included",
    "items: [{ icon, tone }]",
    STAT_GROUP,
    "0.6.0",
  ),
  feature(
    "Eyebrow, value, detail and detail tone",
    "items: [{ eyebrow, value, detail, detailTone }]",
    STAT_GROUP,
    "0.6.0",
  ),
  feature("Stat cell as a link", "items: [{ to }]", STAT_GROUP, "0.6.0"),
  feature("Stable item ids", "items: [{ id }]", STAT_GROUP, "0.6.0"),
  feature(
    "Long detail wrapping to two lines",
    "items: [{ detail }]",
    STAT_GROUP,
    "0.7.6",
  ),
  feature(
    "Composed eyebrow, value and detail",
    "items: [{ value: { key, params } }]",
    STAT_GROUP,
    "0.6.2",
  ),
];

export const KEY_VALUE_FEATURES: PlaygroundFeature[] = [
  feature(
    "Value types: text, status, money, date, link, mono",
    "items: [{ type }]",
    KEY_VALUE,
    "0.6.0",
  ),
  feature("Status and text tones", "items: [{ tone }]", KEY_VALUE, "0.6.0"),
  feature("Row detail and link", "items: [{ detail, to }]", KEY_VALUE, "0.6.0"),
  feature(
    "Copy button on a row",
    "items: [{ copy: true }]",
    KEY_VALUE,
    "0.7.2",
  ),
  feature(
    "Copy a value other than the one shown",
    "items: [{ copyValue }]",
    KEY_VALUE,
    "0.7.2",
  ),
  feature(
    "Row currency and list currency",
    "items: [{ currency }], currency",
    KEY_VALUE,
    "0.6.0",
  ),
  feature(
    "Two and three columns",
    "KeyValueList({ columns })",
    KEY_VALUE,
    "0.6.0",
  ),
  feature(
    "Dense rows without a card",
    "KeyValueList({ dense, card: false })",
    KEY_VALUE,
    "0.6.0",
  ),
  feature(
    "Composed label and value",
    'items: [{ label: "$key", value: { key, params } }]',
    KEY_VALUE,
    "0.7.2",
  ),
  feature(
    "Empty fetched list",
    "KeyValueList({ fetchUrl, empty })",
    KEY_VALUE,
    "0.6.0",
  ),
];

export const NAV_CARD_FEATURES: PlaygroundFeature[] = [
  feature(
    "Settings-style navigation cards with a state",
    "NavCardGrid({ items: [{ icon, title, description, to, state, stateTone }] })",
    NAV_CARDS,
    "0.6.0",
  ),
  feature(
    "Card tag, icon tone and readout",
    "items: [{ tag, iconTone, readout }]",
    NAV_CARDS,
    "0.6.0",
  ),
  feature(
    "Grid columns, title and description",
    "NavCardGrid({ columns, title, description })",
    NAV_CARDS,
    "0.6.0",
  ),
  feature(
    "Cards and states read from a route",
    "NavCardGrid({ fetchUrl })",
    NAV_CARDS,
    "0.6.0",
  ),
  feature(
    "One card per page of a category",
    "NavCardGrid({ category })",
    NAV_CARDS,
  ),
  feature("Empty grid text", "NavCardGrid({ empty })", NAV_CARDS, "0.6.0"),
];

export const ACTIVITY_FEATURES: PlaygroundFeature[] = [
  feature(
    "Feed with day separators and unread dots",
    "ActivityFeed({ items: [{ date, unread }] })",
    ACTIVITY,
    "0.6.0",
  ),
  feature(
    "Entry icon, tone, meta and link",
    "items: [{ icon, tone, meta, to }]",
    ACTIVITY,
    "0.6.0",
  ),
  feature(
    "Flat feed limited to N entries",
    "ActivityFeed({ groupByDay: false, maxItems })",
    ACTIVITY,
    "0.6.0",
  ),
  feature(
    "View all link in the head",
    "ActivityFeed({ actions })",
    ACTIVITY,
    "0.6.0",
  ),
  feature("Mono log lines", "ActivityFeed({ mono: true })", ACTIVITY, "0.6.0"),
  feature("Third mono detail line", "items: [{ detail }]", ACTIVITY, "0.7.10"),
  feature("Text in place of the time", "items: [{ time }]", ACTIVITY, "0.7.10"),
  feature(
    "Head badge and count",
    "ActivityFeed({ badge, count })",
    ACTIVITY,
    "0.7.10",
  ),
  feature(
    "Count answered by the route",
    "{ items, count }",
    ACTIVITY,
    "0.7.10",
  ),
  feature(
    '"Show N more"',
    "ActivityFeed({ visibleItems })",
    ACTIVITY,
    "0.7.12",
  ),
  feature(
    "Wrapped long lines",
    "ActivityFeed({ wrap: true })",
    ACTIVITY,
    "0.7.12",
  ),
  feature(
    "Feed filling the row height",
    "ActivityFeed({ fillHeight: true })",
    ACTIVITY,
    "0.7.10",
  ),
  feature(
    "Feed without a card",
    "ActivityFeed({ card: false })",
    ACTIVITY,
    "0.6.0",
  ),
];

export const METER_FEATURES: PlaygroundFeature[] = [
  feature(
    "Stacked segments with a legend",
    "Meter({ segments, legend: true })",
    METERS,
    "0.6.0",
  ),
  feature(
    "Segment tones (soft, success, warning, error)",
    "segments: [{ tone }]",
    METERS,
    "0.6.0",
  ),
  feature(
    "Value formats: fraction, percent, value, none",
    "Meter({ format })",
    METERS,
    "0.6.0",
  ),
  feature("Single-value tone", "Meter({ tone })", METERS, "0.6.0"),
  feature(
    "Warning and error thresholds",
    "Meter({ warnAt, errorAt })",
    METERS,
    "0.6.0",
  ),
  feature("Sizes xs, sm, md", "Meter({ size })", METERS, "0.6.0"),
  feature("Custom value label", "Meter({ valueLabel })", SETTINGS, "0.6.0"),
  feature(
    "Figures merged from a route",
    "Meter({ fetchUrl })",
    METERS,
    "0.6.0",
  ),
  feature("Composed hint", "Meter({ hint: { key, params } })", METERS, "0.7.2"),
  feature(
    "Meter card with link buttons",
    "Meter({ card: true, actions })",
    METERS,
    "0.6.0",
  ),
];

export const BANNER_FEATURES: PlaygroundFeature[] = [
  feature("Banner tones and icon", "Banner({ tone, icon })", FEEDBACK, "0.6.0"),
  feature("Compact banner", 'Banner({ size: "sm" })', FEEDBACK, "0.6.0"),
  feature(
    "Remembered dismiss",
    "Banner({ dismissible, dismissKey })",
    FEEDBACK,
    "0.6.0",
  ),
  feature(
    "Dismiss remembered under the block id",
    "Banner({ dismissible: true })",
    FEEDBACK,
    "0.6.0",
  ),
  feature(
    "Banner content read from a route",
    "Banner({ fetchUrl })",
    FEEDBACK,
    "0.7.2",
  ),
  feature(
    "Route answering {} draws no banner",
    "Banner({ fetchUrl }) answering {}",
    RECORD,
    "0.7.2",
  ),
  feature(
    "Banner button calling a route with a confirm",
    "actions: [{ target, confirm }]",
    FEEDBACK,
    "0.7.2",
  ),
  feature(
    "Composed banner title and description",
    "{ title: { key, params } }",
    FEEDBACK,
    "0.7.2",
  ),
];
