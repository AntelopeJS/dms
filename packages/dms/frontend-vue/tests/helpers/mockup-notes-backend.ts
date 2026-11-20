import type { MockupAnnotation } from "../../layers/dms-ui/app/entries/utils/mockup";
import type { MockupSpecDocument } from "../../layers/dms-ui/app/entries/utils/mockupSpec";

export function annotation(
  overrides: Partial<MockupAnnotation> = {},
): MockupAnnotation {
  return {
    id: "a1",
    anchor: { block: "b-revenue1", steps: [] },
    offset: { x: 0.5, y: 0.5 },
    page: "orders",
    path: "/pages/0/tree/0",
    text: "Tighten the spacing",
    status: "open",
    createdAt: "2026-11-07T10:00:00.000Z",
    ...overrides,
  };
}

/** What the fake backend serves for a pin put at `place`, the place's page and path as its location, and its sketch state. */
function placed(
  note: MockupAnnotation,
  place: Pick<MockupAnnotation, "page" | "path" | "offset" | "state">,
): MockupAnnotation {
  const { path: _path, state: _state, ...rest } = note;
  return {
    ...rest,
    page: place.page,
    offset: place.offset,
    anchor: place.path ? note.anchor : { page: place.page ?? "" },
    ...(place.path !== undefined && { path: place.path }),
    ...(place.state !== undefined && { state: place.state }),
  };
}

/** A request the viewer sends the fake backend. */
export interface FakeRequest {
  method?: string;
  body?: Record<string, string> & {
    spec?: MockupSpecDocument;
    digest?: string;
    offset?: MockupAnnotation["offset"];
    place?: Pick<MockupAnnotation, "page" | "path" | "offset" | "state">;
  };
}

/** What the fake backend answers on the annotation routes, keeping `notes` as the real one keeps the file. */
export function answerAnnotations(
  notes: MockupAnnotation[],
  url: string,
  init: FakeRequest | undefined,
) {
  if (init?.method === "POST" && init.body) {
    const { text, ...place } = init.body;
    const created = placed(annotation({ id: "new", text }), {
      ...place,
      offset: place.offset ?? { x: 0, y: 0 },
    });
    notes.push(created);
    return created;
  }
  const id = decodeURIComponent(url.split("/").at(-1) ?? "");
  const index = notes.findIndex((entry) => entry.id === id);
  if (init?.method === "DELETE") {
    notes.splice(index, 1);
    return { id };
  }
  if (init?.method === "PATCH" && init.body) {
    const { place, ...change } = init.body;
    const found = { ...notes[index], ...change };
    notes[index] = place ? placed(found, place) : found;
    return notes[index];
  }
  return { annotations: notes };
}
