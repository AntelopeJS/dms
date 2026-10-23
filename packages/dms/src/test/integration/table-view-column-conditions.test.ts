import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { countRawDocuments, resetDatabase } from "../helpers/db";

// The data routes hold to the columns' `visibleWhen` / `disabledWhen`
// (src/test/attachment-host/conditions.ts): the loss reason shows, and is
// mandatory, on a lost deal only; the probability is locked on a won or lost
// deal. A hidden or disabled field's value is ignored, and a field an edit
// hides loses the value it stored.

const LOCATION = "/api/conditions/deals";
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

interface Deal {
  _id: string;
  title: string;
  stage: string;
  lostReason?: string | null;
  probability?: number | null;
}

describe("[integration] table view column conditions", () => {
  let client: AxiosInstance;

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
  });

  const create = (body: Record<string, unknown>) =>
    client.post(`${LOCATION}/new`, body, { validateStatus: () => true });
  const edit = (id: string, body: Record<string, unknown>) =>
    client.put(`${LOCATION}/edit?id=${id}`, body, {
      validateStatus: () => true,
    });
  const read = async (title: string): Promise<Deal> => {
    const response = await client.get(`${LOCATION}/list?limit=50`);
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    const deal = (response.data.results as Deal[]).find(
      (entry) => entry.title === title,
    );
    expect(deal, title).to.exist;
    return deal!;
  };

  it("creates an open deal without the hidden mandatory reason, ignoring the one sent", async () => {
    const created = await create({
      title: "Open",
      stage: "lead",
      lostReason: "price",
      probability: 30,
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    const deal = await read("Open");
    expect(deal.lostReason ?? null).to.equal(null);
    expect(deal.probability).to.equal(30);
  });

  it("refuses a lost deal without its reason, and ignores its locked probability", async () => {
    const refused = await create({ title: "Lost", stage: "lost" });
    expect(refused.status).to.equal(HTTP_BAD_REQUEST);
    expect(JSON.stringify(refused.data)).to.contain("lostReason");

    const created = await create({
      title: "Lost",
      stage: "lost",
      lostReason: "price",
      probability: 80,
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    const deal = await read("Lost");
    expect(deal.lostReason).to.equal("price");
    expect(deal.probability ?? null).to.equal(null);
  });

  it("still applies the mandatory fields without a condition", async () => {
    const refused = await create({ stage: "lead" });
    expect(refused.status).to.equal(HTTP_BAD_REQUEST);
    expect(JSON.stringify(refused.data)).to.contain("title");
  });

  it("reads an edit's conditions on the stored row under its body", async () => {
    const open = await read("Open");
    // Moving to "lost" shows the reason, which the stored row lacks.
    const refused = await edit(open._id, { stage: "lost" });
    expect(refused.status).to.equal(HTTP_BAD_REQUEST);
    expect(JSON.stringify(refused.data)).to.contain("lostReason");

    const lost = await edit(open._id, { stage: "lost", lostReason: "timing" });
    expect(lost.status, JSON.stringify(lost.data)).to.equal(HTTP_OK);

    // The stored stage locks the probability of a body that leaves it out.
    const locked = await edit(open._id, { probability: 90 });
    expect(locked.status, JSON.stringify(locked.data)).to.equal(HTTP_OK);
    const deal = await read("Open");
    expect(deal).to.include({ stage: "lost", lostReason: "timing" });
    expect(deal.probability).to.equal(30);
  });

  it("clears the value a field stored once an edit hides it", async () => {
    const customers = "/api/conditions/customers";
    const created = await client.post(`${customers}/new`, {
      name: "Acme",
      kind: "business",
      vatNumber: "BE0123456749",
    });
    expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    const id = (created.data as { _id: string })._id;
    expect(
      await countRawDocuments("condition-customers", {
        vatNumber: "BE0123456749",
      }),
    ).to.equal(1);

    const household = await client.put(`${customers}/edit?id=${id}`, {
      kind: "residential",
    });
    expect(household.status, JSON.stringify(household.data)).to.equal(HTTP_OK);
    expect(
      await countRawDocuments("condition-customers", { name: "Acme" }),
    ).to.equal(1);
    expect(
      await countRawDocuments("condition-customers", {
        vatNumber: { $nin: [null] },
      }),
    ).to.equal(0);
  });

  it("keeps the value a disabled field stored", async () => {
    // The lost deal of the edit test kept its probability (30).
    expect(
      await countRawDocuments("condition-deals", {
        title: "Open",
        probability: 30,
      }),
    ).to.equal(1);
  });
});
