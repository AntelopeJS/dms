import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as uploadsImpl from "../../../../implementations/dms/uploads";
import * as uploadsInterface from "@antelopejs/interface-dms/uploads";
import { StampUploadFieldTokens } from "@antelopejs/interface-dms/uploads";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  type FormFieldSerialized,
  type FormPropsSerialized,
  isFieldGroupSerialized,
} from "@antelopejs/interface-dms/base/form";
import { Form } from "@antelopejs/interface-dms/base/form-schema";
import { verifyUploadToken } from "../../../../utils/upload-token";

function fieldOptions(field: FormFieldSerialized): Record<string, unknown> {
  return (field.component.options ?? {}) as Record<string, unknown>;
}

describe("[unit] interfaces/dms-base/form — the form stamps its own upload fields", () => {
  before(async () => {
    ImplementInterface(uploadsInterface, uploadsImpl);
  });

  it("bakes a verifiable token into a file field when it serializes", async () => {
    const form = Form({
      fields: [
        {
          id: "attachment",
          type: new DefaultDataTypes.FileType({
            path: "docs/",
            storage: "s3-main",
            attachmentField: "documents#attachment",
          }),
        },
      ],
    });

    const serialized = await form.serialize();
    const options = serialized.options as FormPropsSerialized;
    const field = options.fields[0] as FormFieldSerialized;

    const token = fieldOptions(field).uploadToken;
    expect(token).to.be.a("string");
    expect(verifyUploadToken(token as string)).to.deep.equal({
      storage: "s3-main",
      path: "docs/",
      field: "documents#attachment",
      visibility: "private",
    });
  });

  it("stamps image fields nested inside field groups", async () => {
    const form = Form({
      fields: [
        {
          id: "media",
          fields: [
            {
              id: "cover",
              type: new DefaultDataTypes.ImageType({}),
            },
          ],
        },
      ],
    });

    const serialized = await form.serialize();
    const options = serialized.options as FormPropsSerialized;
    const group = options.fields[0];
    if (!isFieldGroupSerialized(group)) {
      throw new Error("expected a field group");
    }

    const token = fieldOptions(group.fields[0]).uploadToken;
    expect(verifyUploadToken(token as string)).to.deep.equal({
      storage: undefined,
      path: undefined,
      visibility: "private",
    });
  });

  it("leaves non-upload fields alone", async () => {
    const form = Form({
      fields: [
        {
          id: "title",
          type: new DefaultDataTypes.StringType(),
        },
      ],
    });

    const serialized = await form.serialize();
    const options = serialized.options as FormPropsSerialized;
    const field = options.fields[0] as FormFieldSerialized;

    expect(fieldOptions(field).uploadToken).to.equal(undefined);
  });

  // An embedded form — a relation field's inline add form, a table view's
  // new form — serializes synchronously inside its host's options: the host's
  // transform is what reaches it.
  it("stamps the fields of a form embedded in another component's options", async () => {
    const hostOptions = {
      addForm: {
        componentName: "dms-form",
        options: {
          fields: [
            {
              id: "attachment",
              type: "file",
              component: {
                componentName: "dms-file",
                options: {
                  storage: "s3-main",
                  path: "docs/",
                  attachmentField: "documents#attachment",
                  visibility: "public",
                },
              },
            },
          ],
        },
      },
    };

    const stamped = await StampUploadFieldTokens(hostOptions);

    const options = stamped.addForm.options.fields[0].component
      .options as Record<string, unknown>;
    expect(verifyUploadToken(options.uploadToken as string)).to.deep.equal({
      storage: "s3-main",
      path: "docs/",
      field: "documents#attachment",
      visibility: "public",
    });
    // The declaration is untouched: serialization can run again on hot reload.
    expect(
      (
        hostOptions.addForm.options.fields[0].component.options as Record<
          string,
          unknown
        >
      ).uploadToken,
    ).to.equal(undefined);
  });

  // What matters is that nothing was cloned. Reference equality cannot say so
  // across the interface boundary — the caller gets a per-context view of the
  // input back, never the input itself — so the input is mutated afterwards
  // and the returned value has to show it. A clone would not.
  it("returns options without upload fields untouched", async () => {
    const options = { title: "no uploads here", fields: [] as unknown[] };

    const returned = await StampUploadFieldTokens(options);
    options.fields.push({ id: "added-after-the-call" });

    expect(returned.fields).to.have.lengthOf(1);
    expect(returned.title).to.equal(options.title);
  });

  // Serialization runs again on a hot reload: each pass must start from the
  // untransformed declaration, never re-stamp a stamped state.
  it("does not mutate the declared fields across serializations", async () => {
    const form = Form({
      fields: [
        {
          id: "attachment",
          type: new DefaultDataTypes.FileType({ path: "docs/" }),
        },
      ],
    });

    const first = await form.serialize();
    const second = await form.serialize();

    const firstToken = fieldOptions(
      (first.options as FormPropsSerialized).fields[0] as FormFieldSerialized,
    ).uploadToken;
    const secondToken = fieldOptions(
      (second.options as FormPropsSerialized).fields[0] as FormFieldSerialized,
    ).uploadToken;
    expect(verifyUploadToken(firstToken as string)).to.deep.equal(
      verifyUploadToken(secondToken as string),
    );
  });
});
