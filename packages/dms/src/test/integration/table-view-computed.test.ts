import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// Database-computed fields of a table view (src/test/attachment-host/computed.ts):
// the list returns them on every row, whether or not the request filters or
// sorts on them, as the data API's own list does.

const LOCATION = "/api/computed/tasks";
const HTTP_OK = 200;

interface Task {
  title: string;
  remaining?: number;
  shout?: string;
}

describe("[integration] table view computed fields", () => {
  let client: AxiosInstance;

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
    const rows = [
      { title: "Plan", estimate: 8, spent: 3 },
      { title: "Build", estimate: 5, spent: 5 },
    ];
    for (const row of rows) {
      const created = await client.post(`${LOCATION}/new`, row);
      expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    }
  });

  async function list(query = ""): Promise<Task[]> {
    const response = await client.get(`${LOCATION}/list?limit=50${query}`);
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return response.data.results as Task[];
  }

  const computedOf = (tasks: Task[]) =>
    tasks
      .map(({ title, remaining, shout }) => ({ title, remaining, shout }))
      .sort((a, b) => a.title.localeCompare(b.title));

  const EXPECTED = [
    { title: "Build", remaining: 0, shout: "BUILD" },
    { title: "Plan", remaining: 5, shout: "PLAN" },
  ];

  it("returns the computed fields of a page neither sorted nor filtered on them", async () => {
    expect(computedOf(await list())).to.deep.equal(EXPECTED);
  });

  it("returns them on a page sorted on another field", async () => {
    expect(computedOf(await list("&sortKey=title"))).to.deep.equal(EXPECTED);
  });

  it("returns them on a page sorted on one of them", async () => {
    const tasks = await list("&sortKey=remaining&sortDirection=desc");
    expect(tasks.map((task) => task.title)).to.deep.equal(["Plan", "Build"]);
    expect(computedOf(tasks)).to.deep.equal(EXPECTED);
  });

  it("returns them on a searched page", async () => {
    const tasks = await list("&search=pla");
    expect(computedOf(tasks)).to.deep.equal([EXPECTED[1]]);
  });
});

describe("[integration] table view computed sub-query beside a relation", () => {
  let client: AxiosInstance;
  let taskId: string;
  let projectId: string;

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
    const project = await client.post("/api/computed/projects/new", {
      name: "Apollo",
    });
    expect(project.status, JSON.stringify(project.data)).to.equal(HTTP_OK);
    const [created] = (await client.get("/api/computed/projects/list?limit=5"))
      .data.results as { _id: string }[];
    projectId = created!._id;
    for (const title of ["Plan", "Build"]) {
      const task = await client.post(`${LOCATION}/new`, {
        title,
        estimate: 2,
        spent: 1,
        projectId,
      });
      expect(task.status, JSON.stringify(task.data)).to.equal(HTTP_OK);
    }
    const listed = await client.get(`${LOCATION}/list?limit=5&sortKey=title`);
    taskId = (listed.data.results as { _id: string }[])[0]!._id;
  });

  it("resolves a single relation of a row read alone", async () => {
    const response = await client.get(`${LOCATION}/get?id=${taskId}`);
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    expect(response.data.siblings).to.equal(2);
    expect(response.data.projectId).to.include({
      _id: projectId,
      name: "Apollo",
    });
  });

  it("resolves it in the list too", async () => {
    const response = await client.get(`${LOCATION}/list?limit=5`);
    const [task] = response.data.results as Record<string, unknown>[];
    expect(task!.siblings).to.equal(2);
    expect(task!.projectId).to.include({ _id: projectId, name: "Apollo" });
  });
});
