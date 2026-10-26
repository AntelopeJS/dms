// @vitest-environment jsdom
/**
 * The sortable list of the column menu and the kanban: SortableJS moves the
 * dragged element in the DOM, the list puts it back and changes its array, and
 * Vue renders the new order. The drags are replayed as SortableJS reports
 * them, DOM moves included.
 */
import { createApp, h, nextTick, reactive, type App } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import Sortable from "sortablejs";

interface SortableOptions {
  disabled?: boolean;
  [name: string]: unknown;
}

interface FakeSortable {
  el: HTMLElement;
  options: SortableOptions;
}

const instances: FakeSortable[] = [];

const { default: SortableList } = await import(
  "../layers/dms-ui/app/build/components/sortable/SortableList.vue"
);

interface Card {
  id: string;
}

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  instances.length = 0;
  document.body.replaceChildren();
});

type Change = Record<string, { element: Card } & Record<string, number>>;

/** Lists of one group, each bound with `v-model:list`. */
function mountLists(columns: Card[][], changes: Change[][]) {
  const lists = reactive(columns.map((cards) => [...cards]));
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp({
    render: () =>
      lists.map((list, index) =>
        h(
          SortableList as never,
          {
            list,
            "onUpdate:list": (next: Card[]) => (lists[index] = next),
            itemKey: (card: Card) => card.id,
            group: "board",
            onChange: (change: Change) => changes[index]!.push(change),
          },
          { item: ({ element }: { element: Card }) => h("p", element.id) },
        ),
      ),
  });
  app.mount(host);
  for (const element of host.children) {
    if (!(element instanceof HTMLElement)) continue;
    const sortable = Sortable.get(element);
    if (sortable) instances.push({ el: element, options: sortable.options });
  }
  return lists;
}

const ids = (cards: Card[]) => cards.map((card) => card.id);

const texts = (sortable: FakeSortable) =>
  [...sortable.el.children].map((child) => child.textContent);

/** The DOM move SortableJS makes before it reports a drop. */
function moveElement(
  from: HTMLElement,
  oldIndex: number,
  to: HTMLElement,
  newIndex: number,
) {
  const item = from.children[oldIndex] as HTMLElement;
  item.remove();
  to.insertBefore(item, to.children[newIndex] ?? null);
  return item;
}

describe("a sortable list", () => {
  it("reorders its items where they were dropped", async () => {
    const changes: Change[][] = [[]];
    const lists = mountLists(
      [[{ id: "a" }, { id: "b" }, { id: "c" }]],
      changes,
    );
    await nextTick();
    const [sortable] = instances;
    const call = (name: string, event: object) =>
      (sortable!.options[name] as (event: object) => void)(event);

    call("onStart", { item: sortable!.el.children[0], oldIndex: 0 });
    const item = moveElement(sortable!.el, 0, sortable!.el, 2);
    call("onUpdate", { from: sortable!.el, item, oldIndex: 0, newIndex: 2 });
    call("onEnd", {});
    await nextTick();

    expect(ids(lists[0]!)).toEqual(["b", "c", "a"]);
    expect(texts(sortable!)).toEqual(["b", "c", "a"]);
    expect(changes[0]).toEqual([
      { moved: { element: { id: "a" }, oldIndex: 0, newIndex: 2 } },
    ]);
  });

  it("moves an item to another list of its group", async () => {
    const changes: Change[][] = [[], []];
    const lists = mountLists(
      [[{ id: "a" }, { id: "b" }], [{ id: "c" }]],
      changes,
    );
    await nextTick();
    const [source, target] = instances;
    const call = (sortable: FakeSortable, name: string, event: object) =>
      (sortable.options[name] as (event: object) => void)(event);

    call(source!, "onStart", { item: source!.el.children[1], oldIndex: 1 });
    const item = moveElement(source!.el, 1, target!.el, 0);
    // SortableJS reports the add to the list it lands in first.
    call(target!, "onAdd", {
      from: source!.el,
      item,
      oldIndex: 1,
      newIndex: 0,
    });
    call(source!, "onRemove", {
      from: source!.el,
      item,
      oldIndex: 1,
      newIndex: 0,
    });
    call(source!, "onEnd", {});
    await nextTick();

    expect(ids(lists[0]!)).toEqual(["a"]);
    expect(ids(lists[1]!)).toEqual(["b", "c"]);
    expect(texts(source!)).toEqual(["a"]);
    expect(texts(target!)).toEqual(["b", "c"]);
    expect(changes[1]).toEqual([
      { added: { element: { id: "b" }, newIndex: 0 } },
    ]);
    expect(changes[0]).toEqual([
      { removed: { element: { id: "b" }, oldIndex: 1 } },
    ]);
  });

  it("passes SortableJS the options of the list", async () => {
    mountLists([[{ id: "a" }]], [[]]);
    await nextTick();
    expect(instances[0]!.options).toMatchObject({
      group: { name: "board" },
      preventOnFilter: false,
    });
  });
});
