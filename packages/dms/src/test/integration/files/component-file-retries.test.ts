import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestContext } from "@antelopejs/interface-api";
import axios, { type AxiosInstance } from "axios";
import { expect } from "chai";
import { SaveComponentFiles } from "../../../attachments/save";
import type {
  AttachmentSaveRequest,
  AttachmentSaveResult,
} from "@antelopejs/interface-dms/attachments";
import { verifyUploadToken } from "../../../utils/upload-token";
import { nativeUploadToken, uploadAttachment } from "../../helpers/attachments";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";

type StorageInterface = typeof import("@antelopejs/interface-file-storage");
const storage: StorageInterface = require("@antelopejs/interface-file-storage");
const CONTENT = Buffer.from("retained canonical bytes");
const LOCATION = "/api/native-attachments";
const METADATA = "/api/files/metadata";
const SAVE_FAILURE = new Error("Injected persistence failure");
type SaveOrder = "first" | "second";

interface Barrier {
  promise: Promise<void>;
  release(): void;
}

interface Fixture {
  client: AxiosInstance;
  request: AttachmentSaveRequest;
  staged: string;
  canonical: string;
  userId: string;
}

function barrier(): Barrier {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function fixture(field = "file"): Promise<Fixture> {
  const user = await registerUser({ owner: true });
  const client = authorizedClient(user.accessToken);
  const token = await nativeUploadToken(client, field);
  const claims = verifyUploadToken(token);
  if (!claims?.componentId || !claims.field)
    throw new Error("Missing native claims");
  const upload = await uploadAttachment({
    client,
    content: CONTENT,
    mimetype: "text/plain",
    claims: {},
    filename: "retry.txt",
    token,
  });
  const request: AttachmentSaveRequest = {
    context: {
      rawRequest: { headers: { authorization: `Bearer ${user.accessToken}` } },
    } as RequestContext,
    componentIds: [claims.componentId],
    fields: [
      {
        id: claims.field,
        key: field,
        kind: "file",
        visibility: claims.visibility,
      },
    ],
    before: {},
    submitted: { [field]: upload.key },
  };
  return {
    client,
    request,
    staged: upload.key,
    canonical: storage.stripStagingPrefix(upload.key),
    userId: user.userId,
  };
}

async function assertFinal(f: Fixture): Promise<void> {
  const metadata = await f.client.get(METADATA, {
    params: { resourceKey: f.canonical },
  });
  expect(metadata.status, JSON.stringify(metadata.data)).to.equal(200);
  expect((await axios.get(metadata.data.url)).data).to.equal(
    CONTENT.toString(),
  );
}

async function persist(
  f: Fixture,
  document: Record<string, unknown>,
): Promise<AttachmentSaveResult<string>> {
  expect(document.file).to.equal(f.canonical);
  const response = await f.client.post(`${LOCATION}/new`, {
    ...document,
    readerId: f.userId,
  });
  expect(response.status, JSON.stringify(response.data)).to.equal(200);
  await assertFinal(f);
  return { document, result: response.data[0] };
}

function outcome<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value) => ({ status: "fulfilled", value }),
    (reason) => ({ status: "rejected", reason }),
  );
}

class PromotionBarrier {
  readonly scope = new AsyncLocalStorage<SaveOrder>();
  readonly ready = barrier();
  readonly gates = { first: barrier(), second: barrier() };
  readonly arrived = new Set<SaveOrder>();
  private readonly original = storage.PromoteFile;

  constructor(staged: string) {
    storage.PromoteFile = async (key, store) => {
      const order = this.scope.getStore();
      if (key === staged && order) {
        this.arrived.add(order);
        if (this.arrived.size === 2) this.ready.release();
        await this.gates[order].promise;
      }
      return this.original(key, store);
    };
  }

  restore(): void {
    storage.PromoteFile = this.original;
    this.gates.first.release();
    this.gates.second.release();
  }
}

type SaveCallback = (
  document: Record<string, unknown>,
) => Promise<AttachmentSaveResult<string>>;

function startSave(
  f: Fixture,
  promotion: PromotionBarrier,
  order: SaveOrder,
  save: SaveCallback,
) {
  return outcome(
    promotion.scope.run(order, () => SaveComponentFiles(f.request, save)),
  );
}

async function assertCommittedSave(
  f: Fixture,
  result: PromiseSettledResult<string>,
) {
  if (result.status !== "fulfilled") throw result.reason;
  const row = await f.client.get(`${LOCATION}/get`, {
    params: { id: result.value },
  });
  expect(row.status).to.equal(200);
  expect(row.data.file).to.equal(f.canonical);
  await assertFinal(f);
}

async function concurrentSaves(f: Fixture, failing: SaveOrder): Promise<void> {
  const promotion = new PromotionBarrier(f.staged);
  const firstPromoted = barrier();
  const finishFirst = barrier();
  const first = startSave(f, promotion, "first", async (document) => {
    firstPromoted.release();
    await finishFirst.promise;
    if (failing === "first") throw SAVE_FAILURE;
    return persist(f, document);
  });
  const second = startSave(f, promotion, "second", async (document) => {
    if (failing === "second") throw SAVE_FAILURE;
    return persist(f, document);
  });
  try {
    await Promise.race([promotion.ready.promise, first, second]);
    expect(promotion.arrived.size).to.equal(2);
    promotion.gates.first.release();
    await Promise.race([firstPromoted.promise, first]);
    if (failing === "second") {
      finishFirst.release();
      await first;
    }
    promotion.gates.second.release();
    if (failing === "first") {
      await second;
      finishFirst.release();
    }
    const results = { first: await first, second: await second };
    expect(results[failing]).to.deep.equal({
      status: "rejected",
      reason: SAVE_FAILURE,
    });
    await assertCommittedSave(
      f,
      results[failing === "first" ? "second" : "first"],
    );
  } finally {
    promotion.restore();
    finishFirst.release();
    await Promise.all([first, second]);
  }
}

describe("[integration] native canonical file retries", () => {
  beforeEach(resetDatabase);

  for (const failing of ["first", "second"] as const) {
    it(`keeps committed bytes when the ${failing} promoter fails after the other save commits`, async () => {
      await concurrentSaves(await fixture(), failing);
    });
  }

  it("accepts sequential resubmission of the original staged reference", async () => {
    const f = await fixture();
    for (const attempt of ["initial", "retry"]) {
      const response = await f.client.post(
        `${LOCATION}/new`,
        f.request.submitted,
      );
      expect(
        response.status,
        `${attempt}: ${JSON.stringify(response.data)}`,
      ).to.equal(200);
      await assertFinal(f);
    }
  });

  it("retains explicitly public promoted bytes when persistence fails", async () => {
    const f = await fixture("publicFile");
    const saved = await outcome(
      SaveComponentFiles(f.request, async () => {
        throw SAVE_FAILURE;
      }),
    );
    expect(saved).to.deep.equal({ status: "rejected", reason: SAVE_FAILURE });
    const read = await storage.CreateReadUrl(f.canonical);
    expect(read.expiresAt).to.equal(undefined);
    expect((await axios.get(read.url)).data).to.equal(CONTENT.toString());
  });

  it("validates canonical metadata before calling save, including on a retry", async () => {
    const f = await fixture();
    f.request.fields[0].constraints = { maxSize: CONTENT.length - 1 };
    let calls = 0;
    for (const _attempt of ["initial", "retry"]) {
      const result = await outcome(
        SaveComponentFiles(f.request, async (document) => {
          calls += 1;
          return { document, result: "unexpected" };
        }),
      );
      expect(result.status).to.equal("rejected");
      expect(calls).to.equal(0);
      await assertFinal(f);
    }
  });

  it("does not substitute a foreign canonical object for a missing staging source", async () => {
    const f = await fixture();
    await storage.MoveFile(f.staged, f.canonical);
    let calls = 0;
    const result = await outcome(
      SaveComponentFiles(f.request, async (document) => {
        calls += 1;
        return { document, result: "unexpected" };
      }),
    );
    expect(result.status).to.equal("rejected");
    if (result.status === "rejected")
      expect(result.reason.code).to.equal("FILE_CONFLICT");
    expect(calls).to.equal(0);
    await assertFinal(f);
  });
});
