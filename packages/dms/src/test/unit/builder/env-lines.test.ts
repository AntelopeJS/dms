import { expect } from "chai";
import {
  envValue,
  withEnvLine,
  withoutEnvLine,
} from "../../../implementations/dms-builder/engine/env-lines";

/** `.env` lines read as Node and dotenv read them, so Edit and Remove see the value the project gets. */
describe("lines of a .env", () => {
  it("read export, spaces around =, either quote and a trailing comment", () => {
    const text = [
      "export A=1",
      "B = two",
      "C='x # y'",
      'D="p://u:s@h/db"',
      "E=plain # a note",
    ].join("\n");
    expect(
      ["A", "B", "C", "D", "E"].map((name) => envValue(text, name)),
    ).to.deep.equal(["1", "two", "x # y", "p://u:s@h/db", "plain"]);
  });

  it("take the last of several lines, as loadEnvFile does", () => {
    expect(envValue("URL=old\nURL=new\n", "URL")).to.equal("new");
  });

  it("are replaced together, keeping a CRLF file's line ends", () => {
    expect(
      withEnvLine("URL=old\r\nKEEP=1\r\nURL=older\r\n", "URL", 'URL="n"'),
    ).to.equal('URL="n"\r\nKEEP=1\r\nURL="n"\r\n');
  });

  it("are removed in every form, nothing else with them", () => {
    expect(
      withoutEnvLine("export URL='a'\r\nKEEP=1\r\nURL = b\r\n", "URL"),
    ).to.equal("KEEP=1\r\n");
  });
});
