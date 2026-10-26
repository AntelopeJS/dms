import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { getExporter } from "../../../utils/export-jobs";
import { readText } from "../../helpers/files";

const BYTE_ORDER_MARK = "\uFEFF";

describe("[unit] utils/export-jobs — CSV writer", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dms-export-csv-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("quotes a header holding a comma or a quote, like the rows", () => {
    const filePath = path.join(dir, "export.csv");
    const headers = ["name", "city, country", 'say "hi"'];
    const writer = getExporter("csv").createWriter(filePath);

    writer.writeHeaders(headers);
    writer.appendRow(headers, {
      name: "Ada",
      "city, country": "London, UK",
      'say "hi"': "hello",
    });
    writer.close();

    expect(readText(filePath)).to.equal(
      `${BYTE_ORDER_MARK}name,"city, country","say ""hi"""\n` +
        `Ada,"London, UK",hello\n`,
    );
  });
});
