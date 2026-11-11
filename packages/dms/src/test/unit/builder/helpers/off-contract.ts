import type { PageDraft, ThemeDraft } from "@antelopejs/interface-dms-builder";
import { z } from "zod";

const AnyThemeDraft = z.custom<ThemeDraft>();
const AnyPageDraft = z.custom<PageDraft["page"]>();

/** Whatever a caller sends over HTTP: what the schema parses. */
export type Sent = Parameters<(typeof AnyThemeDraft)["parse"]>[0];

/** What an HTTP caller may send in place of a theme draft: any value, which the operation must refuse. */
export function offContractTheme(sent: Sent): ThemeDraft {
  return AnyThemeDraft.parse(sent);
}

/** A page setting set to `null`, which the contract does not allow and SetPageBlocks must clear. */
export function offContractPage(sent: Sent): PageDraft["page"] {
  return AnyPageDraft.parse(sent);
}
