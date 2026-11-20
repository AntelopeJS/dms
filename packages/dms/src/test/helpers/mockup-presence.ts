import type { AxiosInstance } from "axios";
import { z } from "zod";
import type { JsonObject } from "../../mockup";
import type { FollowedStream } from "./mockup-events";
import { MOCKUP_API as BASE } from "./mockup-routes";

export const kpi = (title: string): JsonObject => ({
  type: "KpiCard",
  options: { title },
});

export const SPEC: JsonObject = {
  version: 1,
  pages: [
    {
      id: "home",
      title: "Home",
      tree: [
        {
          type: "Grid",
          children: [{ type: "GridRow", children: [kpi("A"), kpi("B")] }],
        },
        kpi("C"),
      ],
    },
  ],
};

export const GRID = "/pages/0/tree/0";
export const ROW = `${GRID}/children/0`;
export const KPI_A = `${ROW}/children/0`;
export const KPI_B = `${ROW}/children/1`;
export const KPI_C = "/pages/0/tree/1";
const LOCKS = `${BASE}/desk/locks`;
export const SPEC_URL = `${BASE}/desk/spec`;

const presenceSchema = z
  .object({
    viewers: z.array(z.object({ name: z.string(), mine: z.boolean() })),
    locks: z.array(
      z.object({
        name: z.string(),
        mine: z.boolean(),
        page: z.string(),
        path: z.string(),
      }),
    ),
  })
  .strict();

export const lockAnswerSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
});

export function lastPresence(stream: FollowedStream) {
  const frame = stream.frames.findLast((entry) => entry.event === "presence");
  return frame && presenceSchema.parse(JSON.parse(frame.data));
}

export function heldPaths(stream: FollowedStream): string[] {
  return lastPresence(stream)?.locks.map((lock) => lock.path) ?? [];
}

export const lock = (client: AxiosInstance, viewer: string, path: string) =>
  client.put(LOCKS, { viewer, path });

export const renew = (client: AxiosInstance, viewer: string) =>
  client.put(LOCKS, { viewer });

export const unlock = (client: AxiosInstance, viewer: string) =>
  client.delete(`${LOCKS}?viewer=${viewer}`);
