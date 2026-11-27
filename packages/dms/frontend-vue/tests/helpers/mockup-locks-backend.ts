import {
  nodeAt,
  type MockupSpecDocument,
} from "../../layers/dms-ui/app/entries/utils/mockupSpec";
import type { FakeRequest } from "./mockup-notes-backend";

/** A lock request the viewer sent: taking one (`PUT` with a `path`), renewing it (`PUT` without) or freeing it (`DELETE`). */
export interface LockRequest {
  method: string;
  viewer: string;
  path?: string;
  /** The digest of the spec the client read, which a take names. */
  digest?: string;
}

function status(code: number, message: string): Error {
  return Object.assign(new Error(message), { status: code });
}

function recorded(url: string, init: FakeRequest | undefined): LockRequest {
  return {
    method: init?.method ?? "GET",
    viewer:
      init?.body?.viewer ??
      new URL(url, "http://backend").searchParams.get("viewer") ??
      "",
    path: init?.body?.path,
    digest: init?.body?.digest,
  };
}

/** What the fake backend holds of the locks: which block each viewer holds, by the id the block has in the spec. */
export class FakeLocks {
  readonly requests: LockRequest[] = [];
  /** The id of the block held for each viewer; deleting an entry makes its lock run out. */
  readonly holding = new Map<string, string>();
  /** The ids of the blocks other viewers hold: taking one answers 409. */
  readonly rivals = new Set<string>();
  private gate: Promise<void> | undefined;

  /** Holds the answer of every request sent from now on; the returned function lets them answer. */
  hold(): () => void {
    let release = () => {};
    this.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      release();
      this.gate = undefined;
    };
  }

  /**
   * Answers a request as the backend does: a lock taken at `path` names the id
   * of the block the spec has there, and a renewal that names none renews the
   * lock the viewer holds, wherever its block is, or answers 404. A take that
   * names a digest other than the file's `digest` answers 409 and grants nothing.
   */
  async answer(
    url: string,
    init: FakeRequest | undefined,
    file: { spec: MockupSpecDocument; digest: string },
  ): Promise<{ ok: true; id?: string }> {
    const request = recorded(url, init);
    this.requests.push(request);
    const { viewer, path, digest } = request;
    await this.gate;
    if (init?.method === "DELETE") {
      this.holding.delete(viewer);
      return { ok: true };
    }
    if (path !== undefined && digest !== undefined && digest !== file.digest) {
      throw status(409, "$dms.refusals.mockup.lock_spec_changed");
    }
    const id =
      path === undefined
        ? this.holding.get(viewer)
        : (nodeAt(file.spec, path)?.id ?? `b-unstamped-${path}`);
    if (id === undefined) throw status(404, "no lock");
    if (this.rivals.has(id)) throw status(409, "held");
    this.holding.set(viewer, id);
    return { ok: true, id };
  }
}
