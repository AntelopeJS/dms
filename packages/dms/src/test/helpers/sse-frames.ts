import { z } from "zod";

const DATA_PREFIX = "data: ";
const HELLO_PREFIX = "event: hello";

const HelloData = z.object({ connectionId: z.string() });

/**
 * Parses the JSON on an SSE frame's `data:` line against `schema`. A frame
 * without a data line, or whose data is of another shape, fails the test
 * instead of passing as an unchecked type.
 */
export function parseFrameData<Data>(
  schema: z.ZodType<Data, z.ZodTypeDef, unknown>,
  frame: string,
): Data {
  const line = frame
    .split("\n")
    .find((candidate) => candidate.startsWith(DATA_PREFIX));
  if (line === undefined) {
    throw new Error(`SSE frame has no data line: ${JSON.stringify(frame)}`);
  }
  const parsed = schema.safeParse(JSON.parse(line.slice(DATA_PREFIX.length)));
  if (!parsed.success) {
    throw new Error(
      `SSE frame data does not match its schema (${parsed.error.message}): ${JSON.stringify(frame)}`,
    );
  }
  return parsed.data;
}

/** The connection id a stream's `hello` frame carries. */
export function helloConnectionId(frames: readonly string[]): string {
  const hello = frames.find((frame) => frame.startsWith(HELLO_PREFIX));
  if (hello === undefined) {
    throw new Error("The stream carried no hello frame");
  }
  return parseFrameData(HelloData, hello).connectionId;
}
