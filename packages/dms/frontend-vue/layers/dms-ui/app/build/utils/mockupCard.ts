import type { MockupSummary } from "./mockup";
import { MOCKUP_PAGE_ID_PATTERN } from "./mockupSpec";

/** The names the mockup API answers on its own routes: no mockup can take one. */
export const MOCKUP_RESERVED_NAMES: readonly string[] = ["schema", "example"];

/** How far a mockup has come, as its badge says it. */
export type MockupStage =
  | { kind: "draft" }
  | { kind: "partial"; built: number; total: number }
  | { kind: "built" }
  | { kind: "out-of-sync" };

/** The look of a stage's badge: its text key under `dms.mockup` and its colour. */
export interface MockupStageBadge {
  key: string;
  color: "neutral" | "info" | "success" | "warning";
  params?: { built: number; total: number };
}

/**
 * Where a mockup stands: a draft, built into only some of its pages, built
 * into all of them, or built and changed since. A page that changed after the
 * build outranks the count, as the build no longer matches the mockup.
 */
export function stageOf(mockup: MockupSummary): MockupStage {
  if (mockup.status === "draft") return { kind: "draft" };
  if (mockup.builtPages.some((page) => page.changed)) {
    return { kind: "out-of-sync" };
  }
  const built = mockup.builtPages.length;
  return built < mockup.pages
    ? { kind: "partial", built, total: mockup.pages }
    : { kind: "built" };
}

/** The badge a stage is drawn with. */
export function badgeOf(stage: MockupStage): MockupStageBadge {
  switch (stage.kind) {
    case "draft":
      return { key: "status_draft", color: "neutral" };
    case "partial":
      return {
        key: "status_progress",
        color: "info",
        params: { built: stage.built, total: stage.total },
      };
    case "built":
      return { key: "status_built", color: "success" };
    case "out-of-sync":
      return { key: "status_out_of_sync", color: "warning" };
  }
}

/** Whether `name` can be a mockup's folder: a slug the mockup API takes. */
export function isMockupName(name: string): boolean {
  return (
    MOCKUP_PAGE_ID_PATTERN.test(name) && !MOCKUP_RESERVED_NAMES.includes(name)
  );
}
