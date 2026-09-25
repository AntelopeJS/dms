import { describe, expect, it } from "vitest";
import { resolveApiErrorTitle } from "../layers/dms-core/app/composables/useApiError";

describe("resolveApiErrorTitle", () => {
  it("titles a 4xx response as a refused request", () => {
    expect(resolveApiErrorTitle({ statusCode: 403 })).toBe(
      "error.request_refused.title",
    );
    expect(resolveApiErrorTitle({ status: 422 })).toBe(
      "error.request_refused.title",
    );
  });

  it("titles a 5xx response as a server error", () => {
    expect(resolveApiErrorTitle({ statusCode: 502 })).toBe("error.500.title");
  });

  it("titles an error without a status as a server error", () => {
    expect(resolveApiErrorTitle(new Error("network down"))).toBe(
      "error.500.title",
    );
    expect(resolveApiErrorTitle(undefined)).toBe("error.500.title");
  });
});
