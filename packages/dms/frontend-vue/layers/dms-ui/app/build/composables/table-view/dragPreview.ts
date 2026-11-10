/** The look of the copy that follows the pointer while a row or card moves. */
const PREVIEW_CLASS =
  "pointer-events-none fixed top-0 left-0 z-[1000] overflow-hidden rounded-lg bg-default opacity-95 shadow-lg ring-1 ring-primary rotate-[-1deg]";

/** Marks the element a drag copy is made from and the box it is measured on. */
export const REORDER_ITEM_ATTRIBUTE = "data-reorder-item";

export interface DragPreview {
  /** Follow the pointer, given in viewport coordinates. */
  move: (x: number, y: number) => void;
  remove: () => void;
}

/** The box a copy is measured on: a `display: contents` wrapper has none. */
function boxOf(item: HTMLElement): HTMLElement {
  const child = item.firstElementChild;
  return getComputedStyle(item).display === "contents" &&
    child instanceof HTMLElement
    ? child
    : item;
}

/** A table row keeps its cells' widths only inside a table of its own. */
function copyOf(box: HTMLElement): HTMLElement {
  const copy = box.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return document.createElement("div");
  if (!(box instanceof HTMLTableRowElement)) return copy;

  [...box.cells].forEach((cell, index) => {
    const copied = copy.children[index];
    if (copied instanceof HTMLElement) {
      copied.style.width = `${cell.getBoundingClientRect().width}px`;
      copied.style.position = "static";
    }
  });
  const table = document.createElement("table");
  table.style.tableLayout = "fixed";
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.append(document.createElement("tbody"));
  table.tBodies[0]!.append(copy);
  return table;
}

/**
 * Show a copy of the item a drag started on, under the pointer, in place of
 * the browser's own drag image: that one shows only the handle the drag
 * started from, and only outside the page.
 */
export function startDragPreview(
  item: HTMLElement,
  event: DragEvent,
): DragPreview {
  const box = boxOf(item);
  const rect = box.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;

  const preview = document.createElement("div");
  preview.className = PREVIEW_CLASS;
  preview.setAttribute("aria-hidden", "true");
  preview.style.width = `${rect.width}px`;
  preview.append(copyOf(box));

  const blank = document.createElement("span");
  blank.style.cssText = "position:absolute;width:1px;height:1px;opacity:0";
  preview.append(blank);
  document.body.append(preview);
  event.dataTransfer?.setDragImage(blank, 0, 0);

  const move = (x: number, y: number) => {
    preview.style.translate = `${x - offsetX}px ${y - offsetY}px`;
  };
  move(event.clientX, event.clientY);
  return { move, remove: () => preview.remove() };
}
