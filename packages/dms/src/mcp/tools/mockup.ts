import type { McpTool } from "../tool";
import { mockupAnnotationsTool } from "./mockup-annotations";
import { mockupPatchSpecTool } from "./mockup-patch-spec";
import { mockupResolveAnnotationTool } from "./mockup-resolve-annotation";
import { mockupWriteSpecTool } from "./mockup-write-spec";

/**
 * The tools that drive a dev-only mockup (`mockups/<name>/spec.json`, drawn on
 * `/mockup`): read and resolve a reviewer's annotations, write or patch the
 * spec. They read and write `mockups/` under the working directory at each
 * call. None changes the project past what the builder edits, so Safe mode
 * serves them.
 */
export const MOCKUP_TOOLS: readonly McpTool[] = [
  mockupAnnotationsTool,
  mockupResolveAnnotationTool,
  mockupWriteSpecTool,
  mockupPatchSpecTool,
];
