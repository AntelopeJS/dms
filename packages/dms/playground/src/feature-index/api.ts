import {
  Context,
  Controller,
  Get,
  type RequestContext,
} from "@antelopejs/interface-api";
import { GetPageLayoutBySlug } from "@antelopejs/interface-dms/page";
import { PLAYGROUND_FEATURES } from "./catalog";
import { FEATURE_AREAS, type PlaygroundFeature } from "./types";

export const FEATURE_INDEX_URL = "/api/playground-features";

// The tabs filter on the area; the browser searches, sorts and pages.
const AREA_FILTER_KEY = "filter_area";
const IS_FILTER_PREFIX = /^is:/;

type DemoStatus = "shown" | "missing";

interface FeatureRow extends PlaygroundFeature {
  _id: string;
  page: string;
  status: DemoStatus;
}

/** The page part of a demo path: its query and hash lead to a spot on it. */
function pagePath(demo: string): string {
  return demo.split(/[?#]/)[0];
}

function featureRow(feature: PlaygroundFeature, index: number): FeatureRow {
  const page = pagePath(feature.demo);
  return {
    _id: String(index),
    ...feature,
    page,
    status: GetPageLayoutBySlug(page) ? "shown" : "missing",
  };
}

interface FeatureStat {
  icon: string;
  eyebrow: string;
  value: number;
  detail: string;
}

function featureStats(rows: FeatureRow[]): FeatureStat[] {
  const pages = new Set(rows.map((row) => row.page));
  return [
    {
      icon: "i-ph-list-checks",
      eyebrow: "Features",
      value: rows.length,
      detail: `In ${Object.keys(FEATURE_AREAS).length} areas`,
    },
    {
      icon: "i-ph-files",
      eyebrow: "Demo pages",
      value: pages.size,
      detail: "That show them",
    },
    {
      icon: "i-ph-warning-circle",
      eyebrow: "Missing demos",
      value: rows.filter((row) => row.status === "missing").length,
      detail: "Should stay at 0",
    },
  ];
}

/**
 * Rows of the feature index. Each is checked against the pages registered
 * right now, so a demo page renamed or removed shows up as `missing`.
 */
export class PlaygroundFeatureIndexApiController extends Controller(
  FEATURE_INDEX_URL,
) {
  @Get("")
  async list(@Context() ctx: RequestContext) {
    const area = ctx.url.searchParams
      .get(AREA_FILTER_KEY)
      ?.replace(IS_FILTER_PREFIX, "");
    const rows = PLAYGROUND_FEATURES.map(featureRow);
    const results = area ? rows.filter((row) => row.area === area) : rows;
    return { results, total: results.length };
  }

  @Get("stats")
  async stats() {
    return { items: featureStats(PLAYGROUND_FEATURES.map(featureRow)) };
  }
}
