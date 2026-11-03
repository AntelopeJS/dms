import { expect } from "chai";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";

const NEW_ROUTE = "/api/native-attachments/new";
const BODY_BYTES = 1024 * 1024;
const WIDE_ENTRIES = 200_000;
const WIDE_KEYS = 100_000;
const TOO_DEEP = 10_000;
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const REFUSAL = "The JSON body nests more than 64 levels deep.";

/**
 * Time limit of the wide and wide-and-deep requests. The decoder answers them
 * in well under a second; the level-by-level schema it replaced took 11 s on
 * 1 MiB and ran the process out of heap on a 65-deep one.
 */
const REPLY_LIMIT_MS = 5_000;
const TEST_TIMEOUT_MS = 60_000;

const CONTAINERS = ["array", "object"] as const;
type Container = (typeof CONTAINERS)[number];

function nest(container: Container, levels: number) {
  return container === "array"
    ? `${"[".repeat(levels)}${"]".repeat(levels)}`
    : `${'{"a":'.repeat(levels)}1${"}".repeat(levels)}`;
}

/**
 * A body of about 1 MiB holding `{"extra":[E,...]}` next to the fields in
 * `head`. E holds `levels` containers, so the body is `levels + 2` deep.
 */
function wideBody(head: string, container: Container, levels: number) {
  const element = nest(container, levels);
  const count = Math.floor(BODY_BYTES / (element.length + 1));
  return `{${head}"extra":[${Array(count).fill(element).join(",")}]}`;
}

describe("[integration] the table-view save route bounds the depth of its body", function () {
  this.timeout(TEST_TIMEOUT_MS);

  beforeEach(resetDatabase);

  async function post(body: (readerId: string) => string) {
    const user = await registerUser({ owner: true });
    const client = authorizedClient(user.accessToken);
    const text = body(user.userId);
    const started = performance.now();
    const response = await client.post(NEW_ROUTE, text, {
      headers: { "Content-Type": "application/json" },
      maxBodyLength: Infinity,
    });
    return { response, milliseconds: performance.now() - started };
  }

  const reader = (readerId: string) => `"readerId":"${readerId}",`;

  for (const container of CONTAINERS) {
    it(`answers 400 to a body ${TOO_DEEP} ${container} levels deep`, async () => {
      const { response } = await post(
        () => `{"files":${nest(container, TOO_DEEP - 1)}}`,
      );
      expect(response.status, JSON.stringify(response.data)).to.equal(
        HTTP_BAD_REQUEST,
      );
      expect(JSON.stringify(response.data)).to.contain(REFUSAL);
    });

    it(`answers 400 to 1 MiB of ${container} elements 65 levels deep, within the time limit`, async () => {
      const { response, milliseconds } = await post((readerId) =>
        wideBody(reader(readerId), container, 63),
      );
      expect(response.status, JSON.stringify(response.data)).to.equal(
        HTTP_BAD_REQUEST,
      );
      expect(JSON.stringify(response.data)).to.contain(REFUSAL);
      expect(milliseconds).to.be.lessThan(REPLY_LIMIT_MS);
    });

    it(`saves 1 MiB of ${container} elements 64 levels deep, within the time limit`, async () => {
      const { response, milliseconds } = await post((readerId) =>
        wideBody(reader(readerId), container, 62),
      );
      expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
      expect(milliseconds).to.be.lessThan(REPLY_LIMIT_MS);
    });
  }

  it("saves 200k entries in one array, within the time limit", async () => {
    const { response, milliseconds } = await post(
      (readerId) =>
        `{${reader(readerId)}"extra":[${Array(WIDE_ENTRIES).fill('"x"').join(",")}]}`,
    );
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    expect(milliseconds).to.be.lessThan(REPLY_LIMIT_MS);
  });

  it("saves 100k keys in one object, within the time limit", async () => {
    const entries = Array.from(
      { length: WIDE_KEYS },
      (_, index) => `"${index.toString(36)}":1`,
    ).join(",");
    const { response, milliseconds } = await post(
      (readerId) => `{${reader(readerId)}"extra":{${entries}}}`,
    );
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    expect(milliseconds).to.be.lessThan(REPLY_LIMIT_MS);
  });
});
