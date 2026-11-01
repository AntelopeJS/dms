import { toRaw } from "vue";
import { z } from "zod";
import type {
  ApiErrorParams,
  ApiErrorSeverity,
} from "../../composables/useApiErrorPresenter";

const MAX_DEPTH = 8;
const HTTP_FAILURE_MIN = 400;
const HTTP_CLIENT_MAX = 499;
const HTTP_STATUS_MAX = 599;
const statusSchema = z
  .number()
  .int()
  .min(HTTP_FAILURE_MIN)
  .max(HTTP_STATUS_MAX);
const severitySchema = z.enum(["info", "warning", "error"]);
const paramsSchema = z.record(z.union([z.string(), z.number(), z.boolean()]));
const recordSchema = z.object({
  cause: z.unknown().optional(),
  response: z.unknown().optional(),
  data: z.unknown().optional(),
  _data: z.unknown().optional(),
  message: z.unknown().optional(),
  name: z.unknown().optional(),
  severity: z.unknown().optional(),
  params: z.unknown().optional(),
  status: z.unknown().optional(),
  statusCode: z.unknown().optional(),
  body: z.unknown().optional(),
});

interface DecodedBody {
  key?: string;
  params?: ApiErrorParams;
  severity?: ApiErrorSeverity;
  status?: number;
}

/** @internal */
export interface DecodedApiFailure {
  cancelled: boolean;
  identity: object | null;
  key?: string;
  params?: ApiErrorParams;
  severity: ApiErrorSeverity;
}

function record(value: unknown) {
  return recordSchema.safeParse(value).data;
}

function decodeBody(input: unknown): DecodedBody {
  let value = input;
  let status: number | undefined;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (seen.has(value)) return { status };
    seen.add(value);
    if (typeof value === "string") {
      const text = value;
      try {
        const parsed: unknown = JSON.parse(text);
        value = parsed;
        continue;
      } catch {
        return { key: text, status };
      }
    }
    const body = record(value);
    if (!body) return { status };
    const envelopeStatus = statusSchema.safeParse(body.status).data;
    if (envelopeStatus !== undefined && body.body !== undefined) {
      status ??= envelopeStatus;
      value = body.body;
      continue;
    }
    return {
      key: z.string().safeParse(body.message).data,
      severity: severitySchema.safeParse(body.severity).data,
      params: paramsSchema.safeParse(body.params).data,
      status,
    };
  }
  return { status };
}

/** @internal */
export function decodeApiFailure(error: unknown): DecodedApiFailure {
  let current = error;
  let identity: object | null = null;
  let request: DecodedBody | undefined;
  let local: unknown = error;
  let status: number | undefined;
  let cancelled = false;
  let hasFailedResponse = false;
  let params: ApiErrorParams | undefined;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < MAX_DEPTH && !seen.has(current); depth++) {
    seen.add(current);
    const entry = record(current);
    if (!entry) {
      local = current;
      break;
    }
    if (current !== null && typeof current === "object")
      identity = toRaw(current);
    local = entry.message;
    params ??= paramsSchema.safeParse(entry.params).data;
    cancelled ||= entry.name === "AbortError";
    const response = record(entry.response);
    const responseStatus = statusSchema.safeParse(response?.status).data;
    const entryStatus =
      responseStatus ??
      statusSchema.safeParse(entry.statusCode ?? entry.status).data;
    if (
      entry.response &&
      responseStatus !== undefined &&
      typeof entry.response === "object"
    ) {
      identity = toRaw(entry.response);
      request = decodeBody(entry.data ?? response?._data);
      status = responseStatus;
      hasFailedResponse = true;
      break;
    }
    if (entry.data !== undefined || entryStatus !== undefined) {
      request = decodeBody(entry.data);
      status = entryStatus;
    }
    if (entry.cause === undefined) break;
    current = entry.cause;
  }
  const body = request ?? decodeBody(local);
  status ??= body.status;
  return {
    cancelled: cancelled && !hasFailedResponse,
    identity,
    key: body.key,
    params: { ...params, ...body.params },
    severity:
      body.severity ??
      (status !== undefined && status <= HTTP_CLIENT_MAX ? "warning" : "error"),
  };
}
