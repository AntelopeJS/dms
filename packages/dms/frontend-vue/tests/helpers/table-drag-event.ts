import type Sortable from "sortablejs";

export class TableDragEvent extends Event implements Sortable.SortableEvent {
  clone: HTMLElement;
  item: HTMLElement;
  items: HTMLElement[];
  from: HTMLElement;
  to: HTMLElement;
  newIndex = 0;
  oldIndex = 0;
  oldDraggableIndex = 0;
  newDraggableIndex = 0;
  pullMode = true;
  oldIndicies: Sortable.SortableEvent["oldIndicies"] = [];
  newIndicies: Sortable.SortableEvent["newIndicies"] = [];
  swapItem = null;

  override get target(): HTMLElement {
    return this.to;
  }

  constructor(from: HTMLElement, to: HTMLElement, item: HTMLElement) {
    super("sortable");
    this.from = from;
    this.to = to;
    this.item = item;
    this.items = [item];
    this.clone = item;
  }
}
