import {
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Put,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  formSchema,
  type FormSchemaSource,
} from "@antelopejs/interface-dms/base/form";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";

const HTTP_BAD_REQUEST = 400;
export const JSON_TYPE = "application/json";

/** The record of a demo form, kept in memory: a restart puts it back. */
export type DemoRecord = Record<string, unknown>;

/** Who may read and write a demo record: the page showing its form. */
export type DemoRecordGuard = Parameters<typeof AuthUserWithPermission>[0];

/**
 * Checks a submitted body against the form's own schema, as a real endpoint
 * would, and answers the issues as a 400 the form shows under its fields. A
 * form saving only what changed sends a partial body.
 */
export async function parseFormBody(
  form: FormSchemaSource,
  body: DemoRecord,
): Promise<DemoRecord> {
  const parsed = await formSchema(form).partial().safeParseAsync(body);
  if (!parsed.success) {
    throw new HTTPResult(
      HTTP_BAD_REQUEST,
      JSON.stringify(parsed.error.issues),
      JSON_TYPE,
    );
  }
  return parsed.data;
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
    async save(@JSONBody() body: DemoRecord) {
      Object.assign(record, await parseFormBody(form, body));
      return record;
    }
  }
  return DemoRecordAPIController;
}
