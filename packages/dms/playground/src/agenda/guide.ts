import { Banner, KeyValueList } from "@antelopejs/interface-dms/base";
import type { DemoStep } from "../table-view/guide";
import { agendaPagePath } from "./category";

/** The overview page, which lists the steps of the full-page demos. */
const OVERVIEW_SLUG = "agenda-options";

/**
 * The guide of a page that fills the window (`fillHeight`): one compact,
 * dismissible line, so the agenda keeps the height; its full list of steps
 * is on the overview page.
 */
export function compactGuide(text: string) {
  return Banner({
    tone: "info",
    size: "sm",
    title: "What to try",
    description: text,
    dismissible: true,
    actions: [{ label: "All the steps", to: agendaPagePath(OVERVIEW_SLUG) }],
  });
}

/** The steps of a full-page demo, as the overview page lists them. */
export function stepList(title: string, page: string, steps: DemoStep[]) {
  return KeyValueList({
    title,
    items: [
      { label: "Open the page", value: title, to: agendaPagePath(page) },
      ...steps.map(({ label, text, to }) => ({ label, value: text, to })),
    ],
  });
}
