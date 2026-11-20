import { type ClientRequest, get } from "node:http";
import { getBaseUrl } from "./http";
import { MOCKUP_API } from "./mockup-routes";

const POLL_MS = 20;
const BUDGET_MS = 3000;
const FRAME_END = "\n\n";

/** One event of a stream: its name and the JSON text it carries. */
export interface SseFrame {
  event: string;
  data: string;
}

/** An open `/events` stream: every frame it sent so far. */
export interface FollowedStream {
  frames: readonly SseFrame[];
  close: () => void;
}

function parseFrame(text: string): SseFrame | undefined {
  const lines = text.split("\n");
  const event = lines.find((line) => line.startsWith("event: "));
  const data = lines.find((line) => line.startsWith("data: "));
  return event && data
    ? {
        event: event.slice("event: ".length),
        data: data.slice("data: ".length),
      }
    : undefined;
}

/**
 * Opens `/api/mockup/<name>/events` as the user of `token`, naming the viewer
 * `viewer` when given, and collects its frames until it is closed. Resolves
 * once the stream answered.
 */
export function followEvents(
  name: string,
  token: string,
  viewer?: string,
): Promise<FollowedStream> {
  return new Promise((resolve, reject) => {
    const frames: SseFrame[] = [];
    const query = viewer === undefined ? "" : `?viewer=${viewer}`;
    let request: ClientRequest | undefined = get(
      `${getBaseUrl()}${MOCKUP_API}/${name}/events${query}`,
      {
        headers: {
          "x-antelopejs-namespace": "default",
          Authorization: `Bearer ${token}`,
        },
      },
      (response) => {
        let pending = "";
        response.on("data", (chunk: Buffer) => {
          pending += chunk.toString("utf8");
          const parts = pending.split(FRAME_END);
          pending = parts.pop() ?? "";
          for (const part of parts) {
            const frame = parseFrame(part);
            if (frame) frames.push(frame);
          }
        });
        resolve({
          frames,
          close: () => {
            request?.destroy();
            request = undefined;
          },
        });
      },
    );
    request.once("error", reject);
  });
}

/** Whether `condition` holds within `budget` ms. */
export async function eventually(
  condition: () => boolean,
  budget = BUDGET_MS,
): Promise<boolean> {
  const deadline = Date.now() + budget;
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return condition();
}
