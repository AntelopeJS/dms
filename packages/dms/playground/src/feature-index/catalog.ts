import { AGENDA_FEATURES } from "./agenda";
import { BLOCKS_FEATURES } from "./blocks";
import { FORM_FEATURES } from "./form";
import { FRONTEND_FEATURES } from "./frontend";
import { MATRIX_FEATURES } from "./matrix";
import { PAGES_FEATURES } from "./pages";
import { TABLE_VIEW_FEATURES } from "./table-view";
import type { PlaygroundFeature } from "./types";

/** Every feature the playground shows, area by area, in reading order. */
export const PLAYGROUND_FEATURES: PlaygroundFeature[] = [
  ...BLOCKS_FEATURES,
  ...TABLE_VIEW_FEATURES,
  ...MATRIX_FEATURES,
  ...AGENDA_FEATURES,
  ...FORM_FEATURES,
  ...PAGES_FEATURES,
  ...FRONTEND_FEATURES,
];
