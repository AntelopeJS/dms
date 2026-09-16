import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as uploadsImpl from "../../../../implementations/dms/uploads";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";
import {
  PageController,
  PageMetadata,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import type {
  NativeUploadFieldRegistration,
  UploadTokenClaims,
} from "@antelopejs/interface-dms/uploads";
import * as uploads from "@antelopejs/interface-dms/uploads";

function fileComponent(type = "file", name = "dms-table-view") {
  return new ComponentBuilder(name)
    .options({
      formComponents: {
        new: { fields: [{ type, component: { options: {} } }] },
      },
    })
    .action("add", { title: "Add" });
}

function pageMetadata(id: string, component: ComponentBuilder) {
  class Page extends PageController(id, {
    displayName: id,
    category: pagesCategory,
  }) {}
  const metadata = GetMetadata(Page, PageMetadata);
  metadata.SetComponent("files", component);
  return metadata;
}

describe("[unit] native file registration lifetime", () => {
  let declarations: NativeUploadFieldRegistration[];
  const pages: PageMetadata[] = [];

  beforeEach(async () => {
    declarations = [];
    ImplementInterface(uploads, uploadsImpl);
    ImplementInterface(uploads.internal, {
      RegisterNativeUploadField: {
        register: (value: NativeUploadFieldRegistration) =>
          declarations.push(value),
        unregister: (value: NativeUploadFieldRegistration) => {
          declarations = declarations.filter(
            (item) => item.componentId !== value.componentId,
          );
        },
      },
    });
    declarations = [];
  });

  afterEach(async () => {
    for (const page of pages.splice(0)) page.Dispose();
    ImplementInterface(uploads, uploadsImpl);
    ImplementInterface(uploads.internal, uploadsImpl.internal);
  });

  it("keeps read origin mount-specific but uses the actual shared table action", async () => {
    const component = fileComponent();
    const first = pageMetadata("native-first", component);
    const second = pageMetadata("native-second", component);
    pages.push(first, second);
    await first.Register();
    await second.Register();
    expect(declarations.map((item) => item.componentId)).to.deep.equal([
      "pages.native-first.files",
      "pages.native-second.files",
    ]);
    expect(declarations.map((item) => item.writePermission)).to.deep.equal([
      "pages.native-first.files.add",
      "pages.native-first.files.add",
    ]);
    second.Dispose();
    expect(declarations.map((item) => item.componentId)).to.deep.equal([
      "pages.native-first.files",
    ]);
  });

  it("does not register a field when signing resumes after page disposal", async () => {
    let release = () => {};
    let started = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const signing = new Promise<void>((resolve) => {
      started = resolve;
    });
    ImplementInterface(
      { SignUploadToken: uploads.SignUploadToken },
      {
        SignUploadToken: async (claims: UploadTokenClaims) => {
          started();
          await pending;
          return uploadsImpl.SignUploadToken(claims);
        },
      },
    );
    const page = pageMetadata("native-late", fileComponent());
    pages.push(page);
    const registration = page.Register();
    await signing;
    page.Dispose();
    release();
    await registration;
    expect(declarations).to.have.length(0);
  });

  it("does not stamp dms-media asset fields", async () => {
    const page = pageMetadata("native-assets", fileComponent("asset"));
    pages.push(page);
    await page.Register();
    expect(declarations).to.have.length(0);
  });
});
