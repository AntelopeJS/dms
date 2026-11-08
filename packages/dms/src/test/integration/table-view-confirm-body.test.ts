import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const LOCATION = "/api/archive/notes";
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

const ACTIONS = [
  { name: "delete", method: "delete", path: (id: string) => `delete?id=${id}` },
  { name: "archive", method: "put", path: (id: string) => `archive?ids=${id}` },
  { name: "restore", method: "put", path: (id: string) => `restore?ids=${id}` },
] as const;

const REFUSED_BODIES = [
  { body: "[1]", message: "The request body must be a JSON object." },
  { body: "null", message: "The request body must be a JSON object." },
  { body: '"text"', message: "The request body must be a JSON object." },
  { body: "{", message: "Invalid JSON body." },
];

interface Note {
  _id: string;
  title: string;
  isArchived?: boolean;
}

describe("[integration] a guarded confirmation refuses a body that is not a JSON object", () => {
  let client: AxiosInstance;
  let note: Note;

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
    const created = await client.post(`${LOCATION}/new`, { title: "Draft" });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    const listed = await client.get<{ results: Note[] }>(
      `${LOCATION}/list?limit=50`,
    );
    note = listed.data.results[0]!;
  });

  const send = (action: (typeof ACTIONS)[number], body: string) =>
    client.request({
      method: action.method,
      url: `${LOCATION}/${action.path(note._id)}`,
      data: body,
      headers: { "Content-Type": "application/json" },
      transformRequest: [(data: string) => data],
    });

  for (const action of ACTIONS) {
    for (const { body, message } of REFUSED_BODIES) {
      it(`answers 400 to a ${action.name} confirmation of ${body}`, async () => {
        const response = await send(action, body);
        expect(response.status, JSON.stringify(response.data)).to.equal(
          HTTP_BAD_REQUEST,
        );
        expect(JSON.stringify(response.data)).to.contain(message);
      });
    }
  }

  it("keeps the row a refused delete confirmation named", async () => {
    await send(ACTIONS[0], "[1]");
    const listed = await client.get<{ results: Note[] }>(
      `${LOCATION}/list?limit=50`,
    );
    expect(listed.data.results.map((row) => row._id)).to.include(note._id);
  });

  it("archives on a confirmation that is a JSON object", async () => {
    const response = await send(ACTIONS[1], "{}");
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  });
});
