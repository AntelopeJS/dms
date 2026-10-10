import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import { blockFetchUrlMethodOption, blockFetchUrlOption } from "./display";
import { blockTextSchema } from "./internal/composed-text";
import type { BaseComponentProps, EnumOption } from "./types";
import type { BlockText } from "./types/composed-text";
import type { HttpMethod } from "./types/http";

/** Languages a `CodeBlock` highlights; `text` is shown as written. */
export const CODE_BLOCK_LANGUAGES = [
  "json",
  "javascript",
  "typescript",
  "html",
  "sql",
  "shell",
  "text",
] as const;

/** A language a `CodeBlock` highlights: see `CODE_BLOCK_LANGUAGES`. */
export type CodeBlockLanguage = (typeof CODE_BLOCK_LANGUAGES)[number];

/** What the `fetchUrl` of a `CodeBlock` answers. */
export interface CodeBlockResponse {
  code: string;
  /** Overrides the block's `language`. */
  language?: CodeBlockLanguage;
}

/** The options `CodeBlock` takes. */
export interface CodeBlockProps extends BaseComponentProps {
  /** The code, verbatim. */
  code?: string;
  /**
   * Highlighting language. Defaults to `text`. The aliases `js`, `ts`,
   * `bash`, `sh` and `plain` are read as their language.
   */
  language?: CodeBlockLanguage;
  /** A button copies the code. Defaults to `true`. */
  copy?: boolean;
  /** Head of the block: a string (`$` for an i18n key) or a `ComposedText`. */
  title?: BlockText;
  /** Lines shown before the code scrolls. All of them when unset. */
  maxLines?: number;
  /** Wraps long lines instead of scrolling sideways. Defaults to `false`. */
  wrap?: boolean;
  /**
   * Route answering a {@link CodeBlockResponse} (`{ code, language? }`),
   * which replaces `code`: a generated snippet, a stored configuration.
   * `{{params.X}}` and `{{query.X}}` name the page URL, as in
   * `BlockItemsSource.fetchUrl`; it is read again when the page asks its
   * blocks to refresh.
   */
  fetchUrl?: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
}

const CODE_BLOCK_COMPONENT_NAME = "dms-code-block";
const CODE_BLOCK_ICON = "i-ph-code";
const CODE_BLOCK_DEFAULTS = { language: "text", copy: true } as const;

/**
 * CodeBlock — read-only code with highlighting and a copy button: a snippet
 * to paste, a configuration to read, a request body.
 *
 * `options` is optional because a page is written as it is built: the editor
 * places a block before anything is configured, and writes that as the bare
 * call `CodeBlock()`.
 *
 * @example
 * ```typescript
 * CodeBlock({
 *   title: "Field declaration",
 *   language: "typescript",
 *   code: 'cover: MediaField({ accept: ["image/*"] })',
 * })
 * ```
 */
export function CodeBlock(
  options?: CodeBlockProps,
): ComponentBuilder<CodeBlockProps> {
  return new ComponentBuilder<CodeBlockProps>(CODE_BLOCK_COMPONENT_NAME)
    .options({ ...CODE_BLOCK_DEFAULTS, ...options })
    .meta({
      name: (typeof options?.title === "string" && options.title) || "Code",
      icon: CODE_BLOCK_ICON,
    });
}

/** The options `CodeBlock` accepts. */
export const CodeBlockSchema = z.object({
  title: ui(blockTextSchema().optional().describe("Head of the block."), {
    label: "Title",
    group: "content",
    widget: "text",
  }),
  code: ui(z.string().optional().describe("The code, verbatim."), {
    label: "Code",
    group: "content",
    widget: "textarea",
  }),
  language: ui(
    z
      .enum(CODE_BLOCK_LANGUAGES)
      .default(CODE_BLOCK_DEFAULTS.language)
      .describe("Highlighting language."),
    { label: "Language", group: "content", widget: "select" },
  ),
  copy: ui(
    z
      .boolean()
      .default(CODE_BLOCK_DEFAULTS.copy)
      .describe("A button copies the code."),
    { label: "Copy button", group: "features", widget: "switch" },
  ),
  wrap: ui(z.boolean().optional().describe("Wraps long lines."), {
    label: "Wrap lines",
    group: "appearance",
    widget: "switch",
  }),
  maxLines: ui(
    z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Lines shown before the code scrolls."),
    { label: "Maximum lines", group: "layout", widget: "number", min: 1 },
  ),
  fetchUrl: blockFetchUrlOption(
    "Route answering `{ code, language? }`; when set it replaces the code.",
  ),
  fetchUrlMethod: blockFetchUrlMethodOption(),
}) satisfies BlockOptionsFor<CodeBlockProps>;

RegisterBlockType({
  type: "CodeBlock",
  componentName: CODE_BLOCK_COMPONENT_NAME,
  schema: CodeBlockSchema,
  meta: {
    name: "Code",
    icon: CODE_BLOCK_ICON,
    description: "Read-only code with highlighting and a copy button.",
    group: "content",
  },
});
