import { GetMetadata } from "@antelopejs/interface-core";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import { expect } from "chai";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view/meta";

describe("TableView cell wrapping", () => {
  for (const cellWrap of [undefined, false, true]) {
    it(`serializes cellWrap=${cellWrap} without changing the data type`, () => {
      class Controller {}
      const metadata = GetMetadata(Controller, TableViewMeta);
      const dataMetadata = GetMetadata(Controller, DataAPIMeta);
      dataMetadata.fields.subject = { listable: { list: [] } };
      metadata.setColumn("subject", {
        name: "Subject",
        type: new DefaultDataTypes.StringType(),
        cellWrap,
      });

      const config = JSON.parse(JSON.stringify(metadata.config));
      expect(config.columns[0].cellWrap).to.equal(cellWrap);
      expect(config.columns[0].accessorKey).to.equal("subject");
      expect(config.columns[0].listable).to.equal(true);
      expect(config.columns[0].type).to.be.an("object");
    });
  }
});
