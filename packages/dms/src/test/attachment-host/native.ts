import {
  Controller,
  Get,
  HTTPResult,
  Parameter,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  DataAPIMeta,
  ModelReference,
  ModifierKey,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  LocalizationModifier,
  Localized,
  Model,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { AuthTenantMember } from "@antelopejs/interface-dms/guards";
import {
  RegisterPage,
  RootPageController,
} from "@antelopejs/interface-dms/page";
import { authenticateRequestPrincipal } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

const LOCATION = "/api/native-attachments";
const TABLE = "native-attachment-documents";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class NativeDocument extends Table.with(LocalizationModifier) {
  @Field("string") declare readerId: string;
  @Field("string") declare storedFile: string;
  @Field(["string"]) declare files: string[];
  @Field("string") declare publicFile: string;
  @Localized() @Field("any") declare image: DefaultDataTypes.ImageValue;
}

class NativeDocumentModel extends BasicDataModel(NativeDocument, TABLE) {}

@RegisterDataController()
class NativeDocumentController extends DataController(
  NativeDocument,
  {
    new: TableViewRoutes.New,
    edit: TableViewRoutes.Edit,
    get: TableViewRoutes.Get,
    delete: TableViewRoutes.Delete,
  },
  Controller(LOCATION),
) {
  @AuthTenantMember() declare user: User;
  @ModelReference()
  @Model(NativeDocumentModel)
  declare model: NativeDocumentModel;
  @Parameter("x-content-language", "header")
  @ModifierKey(LocalizationModifier)
  declare language: string;
  @Access(AccessMode.ReadOnly) declare _id: string;
  @Access(AccessMode.ReadOnly) declare id: string;
  @Access(AccessMode.ReadWrite) declare readerId: string;
  @Column({
    name: "File",
    type: new DefaultDataTypes.FileType({ constraints: { maxSize: 64 } }),
  })
  @Access(AccessMode.ReadWrite)
  declare file: string;
  @Column({
    name: "Files",
    type: new DefaultDataTypes.FileType({ multiple: true }),
  })
  @Access(AccessMode.ReadWrite)
  declare files: string[];
  @Column({
    name: "Public file",
    type: new DefaultDataTypes.FileType({ visibility: "public" }),
  })
  @Access(AccessMode.ReadWrite)
  declare publicFile: string;
  @Column({ name: "Image", type: new DefaultDataTypes.ImageType() })
  @Access(AccessMode.ReadWrite)
  declare image: DefaultDataTypes.ImageValue;
}

GetMetadata(NativeDocumentController, DataAPIMeta).fields.file.dbName =
  "storedFile";
GetMetadata(NativeDocumentController, DataAPIMeta).fields.id.dbName = "_id";
const form = TableView(NativeDocumentController, {
  rowIdKey: "id",
  rowActions: { add: true, edit: true, details: true },
  guards: {
    get: async (context, { current }) => {
      const principal = await authenticateRequestPrincipal(context);
      if (current.readerId !== principal.user._id)
        throw new HTTPResult(403, "Native row denied");
    },
  },
});

@RegisterPage()
export class NativeFilePage extends RootPageController("nativefiles", {
  displayName: "Native files",
}) {
  static content = form;
}

export class NativeAttachmentFormController extends Controller(
  `${LOCATION}/form`,
) {
  @Get("/")
  async get(@AuthTenantMember() _user: User) {
    return form.serialize();
  }
}
