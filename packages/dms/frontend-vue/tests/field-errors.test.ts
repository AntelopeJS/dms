import { describe, expect, it } from "vitest";
import {
  apiErrorText,
  describeApiError,
  resolveFieldErrors,
} from "../layers/dms-core/app/composables/useFieldErrors";

const FIELDS = ["name", "email", "password"] as const;

/** What `assertValidation` answers: the ZodError's issues, as plain text. */
const zodBody = (issues: unknown[]) => JSON.stringify(issues, null, 2);

describe("resolveFieldErrors", () => {
  it("ties a mapped API code to its field, with the code as message", () => {
    expect(
      resolveFieldErrors(
        { statusCode: 400, data: "error.invalid_current_password" },
        {
          fields: ["currentPassword"],
          codes: { "error.invalid_current_password": "currentPassword" },
        },
      ),
    ).toEqual({
      fields: [
        {
          field: "currentPassword",
          message: "error.invalid_current_password",
        },
      ],
      hasUnmatched: false,
    });
  });

  it("matches a code with or without its $ prefix and can reword it", () => {
    const resolution = resolveFieldErrors(
      { statusCode: 409, data: "$page.settings.roles.error.name_taken" },
      {
        fields: ["name"],
        codes: {
          "page.settings.roles.error.name_taken": {
            field: "name",
            message: "own.key",
          },
        },
      },
    );
    expect(resolution.fields).toEqual([{ field: "name", message: "own.key" }]);
  });

  it("accepts a mapped code on a 401, as a refused two-factor code is", () => {
    expect(
      resolveFieldErrors(
        { statusCode: 401, data: "error.invalid_2fa_code" },
        { fields: ["code"], codes: { "error.invalid_2fa_code": "code" } },
      ).fields,
    ).toEqual([{ field: "code", message: "error.invalid_2fa_code" }]);
  });

  it("reads the zod issues of a 400, generic messages for zod's prose", () => {
    const error = {
      statusCode: 400,
      data: zodBody([
        {
          validation: "email",
          code: "invalid_string",
          message: "Invalid email",
          path: ["email", 0],
        },
        {
          code: "custom",
          message: "$page.settings.members.invite.roles_required",
          path: ["roles"],
        },
        {
          code: "too_small",
          minimum: 1,
          type: "string",
          message: "String must contain at least 1 character(s)",
          path: ["name"],
        },
      ]),
    };
    expect(
      resolveFieldErrors(error, { fields: ["email", "roles", "name"] }),
    ).toEqual({
      fields: [
        {
          field: "email",
          message: "$dms.field_errors.invalid_email",
          path: "email.0",
        },
        {
          field: "roles",
          message: "$page.settings.members.invite.roles_required",
        },
        { field: "name", message: "$dms.field_errors.required" },
      ],
      hasUnmatched: false,
    });
  });

  it("keeps the first issue of a field and flags issues on unknown keys", () => {
    const error = {
      statusCode: 400,
      data: [
        { code: "too_big", message: "Too long", path: ["name"] },
        { code: "custom", message: "$second", path: ["name"] },
        { code: "custom", message: "$hidden", path: ["internal"] },
      ],
    };
    expect(resolveFieldErrors(error, { fields: FIELDS })).toEqual({
      fields: [{ field: "name", message: "$dms.field_errors.too_long" }],
      hasUnmatched: true,
    });
  });

  it("reads a { field, message, values } body", () => {
    const error = {
      statusCode: 409,
      data: {
        message: "$page.settings.members.invite.already_member",
        field: "emails",
        values: ["a@test.local", 3],
      },
    };
    expect(resolveFieldErrors(error, { fields: ["emails"] }).fields).toEqual([
      {
        field: "emails",
        message: "$page.settings.members.invite.already_member",
        values: ["a@test.local"],
      },
    ]);
  });

  it("reads the data API's missing and invalid field lists", () => {
    expect(
      resolveFieldErrors(
        { statusCode: 400, data: "Missing mandatory fields: name, email" },
        { fields: FIELDS },
      ).fields,
    ).toEqual([
      { field: "name", message: "$dms.field_errors.required" },
      { field: "email", message: "$dms.field_errors.required" },
    ]);
    expect(
      resolveFieldErrors(
        { statusCode: 400, data: "Invalid field type(s): password" },
        { fields: FIELDS },
      ).fields,
    ).toEqual([{ field: "password", message: "$dms.field_errors.invalid" }]);
  });

  it("reads a `field: message` text", () => {
    expect(
      resolveFieldErrors(
        { statusCode: 400, data: "name: String must contain 1 character(s)" },
        { fields: FIELDS },
      ).fields,
    ).toEqual([{ field: "name", message: "$dms.field_errors.invalid" }]);
  });

  it.each([
    ["a network failure", new Error("fetch failed")],
    ["a 403", { statusCode: 403, data: "error.forbidden" }],
    ["a 429", { status: 429, data: "error.rate_limited" }],
    ["a 500", { statusCode: 500, data: "error.invalid_current_password" }],
  ])("never ties %s to a field", (_label, error) => {
    expect(
      resolveFieldErrors(error, {
        fields: ["currentPassword"],
        codes: { "error.invalid_current_password": "currentPassword" },
      }),
    ).toEqual({ fields: [], hasUnmatched: true });
  });

  it("leaves an unmapped code to the toast", () => {
    expect(
      resolveFieldErrors(
        { statusCode: 409, data: "$page.settings.roles.error.in_use" },
        { fields: ["name"] },
      ),
    ).toEqual({ fields: [], hasUnmatched: true });
  });

  it("ignores a field the form does not show", () => {
    expect(
      resolveFieldErrors(
        { statusCode: 400, data: { field: "secret", message: "$x" } },
        { fields: FIELDS },
      ),
    ).toEqual({ fields: [], hasUnmatched: true });
  });
});

describe("describeApiError", () => {
  it("words a toast from the body, its message or its first issue", () => {
    expect(describeApiError({ data: "error.rate_limited" })).toBe(
      "error.rate_limited",
    );
    expect(describeApiError({ data: { message: "$key" } })).toBe("$key");
    expect(
      describeApiError({
        data: zodBody([{ code: "custom", message: "$first", path: ["x"] }]),
      }),
    ).toBe("$first");
  });

  it("falls back to the generic server error without a body", () => {
    expect(describeApiError(new Error("down"))).toBe("error.500.description");
    expect(apiErrorText(new Error("down"))).toBeUndefined();
  });
});
