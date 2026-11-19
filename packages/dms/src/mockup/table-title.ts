import { z } from "zod";
import {
  jsonPointer,
  type MockupIssue,
  type MockupNode,
  type MockupSpec,
} from "./model";

const TABLE_TYPE = "TableView";

/** The message of a mockup table that has no title. */
export const TABLE_CAPTION_MESSAGE =
  'a table needs a caption: set its options.caption to the title of the table, such as "Orders". Without one the real TableView moves its status tabs into the header and draws the views strip under them.';

/** A caption that names nothing: absent or blank. Text of any other kind is refused by the options' own schema. */
const noCaption = z.union([z.undefined(), z.string().trim().max(0)]);

function captionIssues(
  node: MockupNode,
  path: ReadonlyArray<string | number>,
): MockupIssue[] {
  const own: MockupIssue[] =
    node.type === TABLE_TYPE &&
    noCaption.safeParse(node.options?.caption).success
      ? [
          {
            path: jsonPointer([...path, "options", "caption"]),
            message: TABLE_CAPTION_MESSAGE,
          },
        ]
      : [];
  const nested = (node.children ?? []).flatMap((child, index) =>
    captionIssues(child, [...path, "children", index]),
  );
  return [...own, ...nested];
}

/**
 * The tables of `spec` that have no caption, each at its `options/caption`.
 * A table whose `options.caption` is absent or blank counts; a page linked to
 * a live page is left out, since its tables mirror that page's own.
 */
export function tableCaptionIssues(spec: MockupSpec): MockupIssue[] {
  return spec.pages.flatMap((page, index) =>
    page.livePage
      ? []
      : page.tree.flatMap((node, at) =>
          captionIssues(node, ["pages", index, "tree", at]),
        ),
  );
}
