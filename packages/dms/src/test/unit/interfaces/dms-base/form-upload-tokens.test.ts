import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as uploadsImpl from "../../../../implementations/dms/uploads";
import * as uploadsInterface from "@antelopejs/interface-dms/uploads";
import { StampUploadFieldTokens } from "@antelopejs/interface-dms/uploads";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Form,
  type FormFieldSerialized,
  type FormPropsSerialized,
  isFieldGroupSerialized,
} from "@antelopejs/interface-dms/base/form";
import { verifyUploadToken } from "../../../../utils";

function fieldOptions(field: FormFieldSerialized): { uploadToken?: string } {
  return field.component.options ?? {};
}

function leadingField(options: FormPropsSerialized): FormFieldSerialized {
  const entry = options.fields[0];
  if (isFieldGroupSerialized(entry)) throw new Error("expected a field");
  return entry;
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
    const options = serialized.options!;
    const field = leadingField(options);

    const token = fieldOptions(field).uploadToken;
    expect(token).to.be.a("string");
    expect(verifyUploadToken(token!)).to.deep.equal({
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
    const options = serialized.options!;
    const group = options.fields[0];
    if (!isFieldGroupSerialized(group)) {
      throw new Error("expected a field group");
    }

    const token = fieldOptions(group.fields[0]).uploadToken;
    expect(verifyUploadToken(token!)).to.deep.equal({
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
    const options = serialized.options!;
    const field = leadingField(options);

    expect(fieldOptions(field).uploadToken).to.equal(undefined);
  });

  it("stamps the fields of a form embedded in another component's options", async () => {
    const uploadOptions: DefaultDataTypes.FileType["options"] & {
      uploadToken?: string;
    } = {
      storage: "s3-main",
      path: "docs/",
      attachmentField: "documents#attachment",
      visibility: "public",
    };
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
                options: uploadOptions,
              },
            },
          ],
        },
      },
    };

    const stamped = await StampUploadFieldTokens(hostOptions);

    const options = stamped.addForm.options.fields[0].component.options;
    expect(verifyUploadToken(options.uploadToken!)).to.deep.equal({
      storage: "s3-main",
      path: "docs/",
      field: "documents#attachment",
      visibility: "public",
    });

    expect(
      hostOptions.addForm.options.fields[0].component.options.uploadToken,
    ).to.equal(undefined);
  });

  it("returns options without upload fields untouched", async () => {
    const fields: Array<{ id: string }> = [];
    const options = {
      title: "no uploads here",
      fields,
    };

    const returned = await StampUploadFieldTokens(options);
    options.fields.push({ id: "added-after-the-call" });

    expect(returned.fields).to.have.lengthOf(1);
    expect(returned.title).to.equal(options.title);
  });

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

    const firstField = leadingField(first.options!);
    const secondField = leadingField(second.options!);
    const firstToken = fieldOptions(firstField).uploadToken;
    const secondToken = fieldOptions(secondField).uploadToken;
    expect(verifyUploadToken(firstToken!)).to.deep.equal(
      verifyUploadToken(secondToken!),
    );
  });
});
