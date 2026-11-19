import { expect } from "chai";
import { FileDurations, testFilePath } from "../helpers/file-durations";

describe("[unit] file durations", () => {
  it("gives the time since the previous test end to the later test's file, so a slow setup is charged to the file that waited for it", () => {
    const durations = new FileDurations(0);
    durations.testEnded("a.test.js", 1000);
    durations.testEnded("b.test.js", 4000);
    durations.testEnded("a.test.js", 4500);
    expect(durations.finish(4500)).to.deep.equal({
      "a.test.js": 1.5,
      "b.test.js": 3,
    });
  });

  it("adds the time after the last test end to the last file, so the teardown of the run is not lost", () => {
    const durations = new FileDurations(0);
    durations.testEnded("a.test.js", 1000);
    durations.testEnded("b.test.js", 2000);
    expect(durations.finish(5000)).to.deep.equal({
      "a.test.js": 1,
      "b.test.js": 4,
    });
  });

  it("answers no file for a run without tests", () => {
    expect(new FileDurations(0).finish(9000)).to.deep.equal({});
  });

  it("names a test file from the working folder with / separators, so the key matches what test-files.mjs prints", () => {
    expect(testFilePath(`${process.cwd()}/dist/test/a.test.js`)).to.equal(
      "dist/test/a.test.js",
    );
  });
});
