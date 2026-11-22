import { toRaw } from "vue";
import { z } from "zod";
import { isString } from "../../utils/type-check";
import { isRecord } from "../utils/record";
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
const paramsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);
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

/** What a failure is read from: anything thrown, as the schemas parse it. */
type FailureInput = Parameters<typeof recordSchema.safeParse>[0];
type FailureRecord = z.infer<typeof recordSchema>;

/** A response the backend answered with a failure status. */
interface FailedResponse {
  raw: object;
  data: FailureRecord["_data"];
  status: number;
}

function record(value: FailureInput): FailureRecord | undefined {
  return recordSchema.safeParse(value).data;
}

function decodeBody(input: FailureInput): DecodedBody {
  let value = input;
  let status: number | undefined;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (seen.has(value)) return { status };
    seen.add(value);
    if (isString(value)) {
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

function failedResponseOf(entry: FailureRecord): FailedResponse | undefined {
  const response = record(entry.response);
  const status = statusSchema.safeParse(response?.status).data;
  if (!response || status === undefined || !isRecord(entry.response))
    return undefined;
  return { raw: entry.response, data: response._data, status };
}

function severityOf(
  body: DecodedBody,
  status: number | undefined,
): ApiErrorSeverity {
  if (body.severity) return body.severity;
  return status !== undefined && status <= HTTP_CLIENT_MAX
    ? "warning"
    : "error";
}

/** @internal */
export function decodeApiFailure(error: FailureInput): DecodedApiFailure {
  let current = error;
  let identity: object | null = null;
  let request: DecodedBody | undefined;
  let local: FailureInput = error;
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
    if (isRecord(current)) identity = toRaw(current);
    local = entry.message;
    params ??= paramsSchema.safeParse(entry.params).data;
    cancelled ||= entry.name === "AbortError";
    const failed = failedResponseOf(entry);
    if (failed) {
      identity = toRaw(failed.raw);
      request = decodeBody(entry.data ?? failed.data);
      status = failed.status;
      hasFailedResponse = true;
      break;
    }
    const entryStatus = statusSchema.safeParse(
      entry.statusCode ?? entry.status,
    ).data;
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
    severity: severityOf(body, status),
  };
}
