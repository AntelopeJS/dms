import {
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Put,
} from "@antelopejs/interface-api";
import { z } from "zod";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  formSchema,
  type FormSchemaSource,
} from "@antelopejs/interface-dms/base/form";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import type { JsonValue } from "@antelopejs/interface-dms/base/types";

const HTTP_BAD_REQUEST = 400;
export const JSON_TYPE = "application/json";

type Scalar = string | number | boolean | null;
type Flat = Scalar | Scalar[];

/** What a date field parses to: a day, a list of days, or a `{ start, end }` range. */
type DateValue = Date | Date[] | { start: Date; end: Date };

/**
 * A value of a demo form: a scalar, a list of scalars, a date shape, or one
 * level of named parts (an address, a localized text).
 */
export type DemoValue = Flat | DateValue | { [part: string]: Flat };

/** The record of a demo form, kept in memory: a restart puts it back. */
export type DemoRecord = Record<string, DemoValue>;

/** The body a client sends to save a demo form: any JSON object, checked by {@link parseFormBody}. */
export type DemoBody = Record<string, JsonValue>;

const ScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const FlatSchema = z.union([ScalarSchema, z.array(ScalarSchema)]);
const DateSchema = z.date();
const DateValueSchema = z.union([
  DateSchema,
  z.array(DateSchema),
  z.object({ start: DateSchema, end: DateSchema }).strict(),
]);
const DemoRecordSchema = z.record(
  z.union([FlatSchema, DateValueSchema, z.record(FlatSchema)]),
) satisfies z.ZodType<DemoRecord>;

/** Who may read and write a demo record: the page showing its form. */
export type DemoRecordGuard = Parameters<typeof AuthUserWithPermission>[0];

/**
 * Checks a submitted body against the form's own schema, as a real endpoint
 * would, and answers the issues as a 400 the form shows under its fields. A
 * form saving only what changed sends a partial body.
 */
export async function parseFormBody(
  form: FormSchemaSource,
  body: DemoBody,
): Promise<DemoRecord> {
  const parsed = await formSchema(form).partial().safeParseAsync(body);
  if (!parsed.success) {
    throw new HTTPResult(
      HTTP_BAD_REQUEST,
      JSON.stringify(parsed.error.issues),
      JSON_TYPE,
    );
  }
  const record = DemoRecordSchema.safeParse(parsed.data);
  if (!record.success) {
    throw new HTTPResult(
      HTTP_BAD_REQUEST,
      JSON.stringify(record.error.issues),
      JSON_TYPE,
    );
  }
  return record.data;
}

/** What a demo record route serves: where, to whom, which form, its values. */
export interface DemoRecordOptions {
  location: string;
  guard: DemoRecordGuard;
  form: FormSchemaSource;
  record: DemoRecord;
}

/**
 * The `get` and `save` routes of a demo form: `get` answers the record, and
 * `save` validates the body against the form and merges it in.
 */
export function DemoRecordController(options: DemoRecordOptions) {
  const { location, guard, form, record } = options;
  class DemoRecordAPIController extends Controller(location) {
    @AuthUserWithPermission(guard)
    declare user: User;

    @Get("get")
    get() {
      return record;
    }

    @Put("save")
    async save(@JSONBody() body: DemoBody) {
      Object.assign(record, await parseFormBody(form, body));
      return record;
    }
  }
  return DemoRecordAPIController;
}
