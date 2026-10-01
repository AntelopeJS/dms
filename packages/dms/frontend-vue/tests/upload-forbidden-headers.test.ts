import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useUploadWithProgress } from "../layers/dms-ui/app/composables/form/useUploadWithProgress";

const UPLOAD_URL = "https://storage.example.test/upload/token";
const setRequestHeader = vi.fn();

class FakeXMLHttpRequest {
  status = 200;
  upload = {};
  onload: (() => void) | null = null;
  open = vi.fn();
  setRequestHeader = setRequestHeader;
  send() {
    this.onload?.();
  }
}

beforeEach(() => {
  vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("forwards presign headers except the ones a browser refuses to set", async () => {
  const { uploadWithProgress } = useUploadWithProgress();

  await uploadWithProgress(
    {
      uploadUrl: UPLOAD_URL,
      resourceKey: "__staging__/cover.png",
      headers: {
        "Content-Type": "image/png",
        "Content-Length": "42",
        host: "storage.example.test",
        Connection: "keep-alive",
        "Sec-Fetch-Mode": "cors",
        "Proxy-Authorization": "Basic secret",
        "x-amz-meta-owner": "tenant",
      },
    },
    new File(["bytes"], "cover.png", { type: "image/png" }),
    () => undefined,
  );

  expect(setRequestHeader.mock.calls).toEqual([
    ["Content-Type", "image/png"],
    ["x-amz-meta-owner", "tenant"],
  ]);
});
