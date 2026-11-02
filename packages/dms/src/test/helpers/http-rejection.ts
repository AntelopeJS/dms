import { HTTPResult } from "@antelopejs/interface-api";

/**
 * The `HTTPResult` that `call` rejects with. Fails when the call resolves, and
 * rethrows any other rejection so its message reaches the test report.
 */
export async function httpRejectionOf(
  call: Promise<unknown>,
): Promise<HTTPResult> {
  try {
    await call;
  } catch (error: unknown) {
    if (error instanceof HTTPResult) return error;
    throw error;
  }
  throw new Error("expected the call to be rejected with an HTTPResult");
}
