import {
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Post,
  Put,
} from "@antelopejs/interface-api";
import { randomBytes } from "node:crypto";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { formSchema } from "@antelopejs/interface-dms/base/form";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { PageFormFieldTypes } from "./field-types/page";

const HTTP_BAD_REQUEST = 400;
const JSON_TYPE = "application/json";
const SECRET_BYTES = 16;

/** The demo's values, kept in memory: a restart puts them back. */
const values: Record<string, unknown> = {
  plan: "pro",
  addons: ["enterprise"],
  thinking: "medium",
  region: "eu",
  auditLog: true,
  terms: true,
  owner: false,
  categories: [
    { name: "Orders", templates: 4 },
    { name: "Account & access", templates: 4 },
  ],
  headers: {
    "Content-Type": { value: "application/json", enabled: true },
    "X-Idempotency-Key": { value: "7c1e0b2a", enabled: false },
  },
  recipients: ["ops@acme.io"],
  webhookUrl: "https://acme.dms.app/api/mailing/events/brevo",
  webhookSecret: "whsec_5a8d1c0e9b7f4a2d6c3e1f0a9b8cf3a9",
  payload: '{\n  "event": "order.created",\n  "retries": 3\n}',
  query: "select * from orders",
  retention: 90,
  billingEmail: "billing@acme.io",
};

/** Loads, saves and rotates the "Field types" demo form. */
export class FormFieldTypesAPIController extends Controller(
  "/api/form-field-types",
) {
  @AuthUserWithPermission(PageFormFieldTypes)
  declare user: User;

  @Get("get")
  get() {
    return values;
  }

  @Get("completions")
  completions() {
    return {
      items: [
        { label: "invoices", detail: "312 rows", icon: "i-ph-table" },
        { label: "order_items", detail: "9,940 rows", icon: "i-ph-table" },
      ],
    };
  }

  @Post("rotate")
  rotate() {
    values.webhookSecret = `whsec_${randomBytes(SECRET_BYTES).toString("hex")}`;
    return { value: values.webhookSecret };
  }

  @Put("save")
  async save(@JSONBody() body: Record<string, unknown>) {
    const parsed = await formSchema(PageFormFieldTypes.form)
      .partial()
      .safeParseAsync(body);
    if (!parsed.success) {
      throw new HTTPResult(
        HTTP_BAD_REQUEST,
        JSON.stringify(parsed.error.issues),
        JSON_TYPE,
      );
    }
    Object.assign(values, parsed.data);
    return values;
  }
}
