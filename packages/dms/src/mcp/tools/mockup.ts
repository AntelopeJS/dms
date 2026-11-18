import type { McpTool } from "../tool";
import { mockupAnnotationsTool } from "./mockup-annotations";
import { mockupApplyToPageTool } from "./mockup-apply-to-page";
import { mockupFromPageTool } from "./mockup-from-page";
import { mockupPatchSpecTool } from "./mockup-patch-spec";
import { mockupReadSpecTool } from "./mockup-read-spec";
import { mockupResolveAnnotationTool } from "./mockup-resolve-annotation";
import { mockupWriteSpecTool } from "./mockup-write-spec";

/**
 * The tools that drive a dev-only mockup (`mockups/<name>/spec.json`, drawn on
 * `/mockup`): read and resolve a reviewer's annotations, read, write or patch
 * the spec, convert a live page into one and build it back into that page. They
 * read and write `mockups/` under the working directory at each call. None
 * changes the project past what the builder edits, so Safe mode serves them.
 */
export const MOCKUP_TOOLS: readonly McpTool[] = [
  mockupAnnotationsTool,
  mockupResolveAnnotationTool,
  mockupReadSpecTool,
  mockupWriteSpecTool,
  mockupPatchSpecTool,
  mockupFromPageTool,
  mockupApplyToPageTool,
];
