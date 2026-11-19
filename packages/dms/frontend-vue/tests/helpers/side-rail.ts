import { vi } from "vitest";

/** The width the assistant gives its folded bar, in px. */
export const FOLD_RAIL_WIDTH = 40;

export interface FoldedRail {
  rail: HTMLElement;
  remove: () => void;
}

/**
 * Draws what the assistant draws when its panel is folded: a bar fixed on the
 * right edge, mounted on `document.body` outside the side panel host.
 */
export function mountFoldedRail(): FoldedRail {
  const host = document.createElement("div");
  host.innerHTML =
    '<aside class="dms-assistant-chat-tokens dms-assistant-fold"><button type="button">Assistant</button></aside>';
  document.body.append(host);
  const rail = host.querySelector<HTMLElement>("aside");
  if (!rail) throw new Error("The folded rail was not drawn");
  vi.spyOn(rail, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, FOLD_RAIL_WIDTH, 600),
  );
  return { rail, remove: () => host.remove() };
}
