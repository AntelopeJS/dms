import { PassThrough } from "node:stream";
import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";
import { requestContextFixture } from "./request-context";

class RecordingStream extends PassThrough {
  readonly frames: string[] = [];
  ended = false;

  override write(frame: string): boolean {
    this.frames.push(frame);
    return true;
  }

  override end(): this {
    this.ended = true;
    return this;
  }
}

class RecordingResult extends HTTPResult {
  constructor(private readonly recorder: RecordingStream) {
    super();
  }

  override getWriteStream(): PassThrough {
    return this.recorder;
  }
}

/** A request whose response stream keeps every frame written to it, synchronously. */
export interface RecordedSseStream {
  ctx: RequestContext;
  frames: string[];
  isEnded: () => boolean;
}

/**
 * A request context over a real, unconnected request, with no headers unless
 * an `Authorization` value is given, whose response stream records the frames
 * and the end the code under test writes.
 */
export function recordedSseStream(authorization?: string): RecordedSseStream {
  const recorder = new RecordingStream();
  const ctx: RequestContext = {
    ...requestContextFixture(undefined, authorization),
    response: new RecordingResult(recorder),
  };
  return { ctx, frames: recorder.frames, isEnded: () => recorder.ended };
}
