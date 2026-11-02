import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { pageRoutePath } from "@antelopejs/interface-dms/page";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const LOCATION = pageRoutePath("/settings/user/notifications");
const HTTP_OK = 200;

interface InboxPage {
  results: unknown[];
  total: number;
}

const InboxPageSchema = z.object({
  results: z.array(z.unknown()),
  total: z.number(),
}) satisfies z.ZodType<InboxPage>;

describe("[integration] notifications inbox read-state filter", () => {
  let client: AxiosInstance;

  const inbox = async (filter?: string) => {
    const response = await client.get(`${LOCATION}/inbox`, {
      params: filter === undefined ? {} : { filter_isRead: filter },
    });
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return InboxPageSchema.parse(response.data);
  };

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
  });

  for (const filter of ["constructor", "toString", "__proto__"]) {
    it(`lists the whole inbox for the unrecognised filter ${filter}`, async () => {
      const unfiltered = await inbox();
      const filtered = await inbox(filter);
      expect(filtered.total).to.equal(unfiltered.total);
      expect(filtered.results).to.have.length(unfiltered.results.length);
    });
  }
});
