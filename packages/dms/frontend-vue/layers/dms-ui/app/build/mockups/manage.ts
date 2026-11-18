import { isObject, isString } from "#dms-core/app/utils/type-check";
import { mockupEndpoint } from "../utils/mockup";

/** What a mockup change sends: a new name, a new title, or both. */
export interface MockupRenameRequest {
  name?: string;
  title?: string;
}

type Answer = Parameters<typeof isObject>[0];

/** `$authFetch`, as far as the card menu uses it. */
export type MockupFetch = (
  url: string,
  options: { method: "PATCH" | "POST" | "DELETE"; body?: object },
) => Promise<Answer>;

function readName(answer: Answer): string {
  if (isObject(answer) && answer !== null && !Array.isArray(answer)) {
    const { name } = answer;
    if (isString(name)) return name;
  }
  throw new Error("Unexpected answer from the mockup API");
}

/** Renames mockup `name`, and answers the name it has now. */
export async function renameMockup(
  fetch: MockupFetch,
  name: string,
  change: MockupRenameRequest,
): Promise<string> {
  return readName(
    await fetch(mockupEndpoint(name), { method: "PATCH", body: change }),
  );
}

/** Copies mockup `name` into a draft the server names, and answers that name. */
export async function duplicateMockup(
  fetch: MockupFetch,
  name: string,
): Promise<string> {
  return readName(
    await fetch(mockupEndpoint(name, "/duplicate"), {
      method: "POST",
      body: {},
    }),
  );
}

/** Deletes the folder of mockup `name`. */
export async function deleteMockup(
  fetch: MockupFetch,
  name: string,
): Promise<void> {
  await fetch(mockupEndpoint(name), { method: "DELETE" });
}
