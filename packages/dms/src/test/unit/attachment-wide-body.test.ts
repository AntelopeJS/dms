import { HTTPResult } from "@antelopejs/interface-api";
import type {
  AttachmentField,
  AttachmentSaveRequest,
} from "@antelopejs/interface-dms/attachments";
import { expect } from "chai";
import { SaveComponentFiles } from "../../attachments";
import { untouchedRequestContext } from "../helpers/request-context";

const MAX_DEPTH = 64;
const BAD_REQUEST = 400;
const REFUSAL = "The JSON body nests more than 64 levels deep.";
const CONTAINERS = ["array", "object"] as const;
type Container = (typeof CONTAINERS)[number];
type Nested = null | Nested[] | { child: Nested };
type FieldValue = Nested[] | number[] | Record<string, number>;

const WIDTH = 200_000;
const BODY_BYTES = 1024 * 1024;
const MAX_SAVE_MS = 10_000;
const MAX_REFUSAL_MS = 2_000;
const TEST_TIMEOUT_MS = 20_000;
const BODY_AND_FIELD_LEVELS = 2;

const FILE_FIELD: AttachmentField = {
  id: "gallery",
  key: "gallery",
  kind: "file",
};

/**
 * The value of a field whose deepest container sits `levels` levels down, the
 * body itself counted. It ends in `null`, which holds no reference.
 */
function nestedField(levels: number, container: Container) {
  let value: Nested = null;
  for (let level = 2; level <= levels; level += 1)
    value = container === "array" ? [value] : { child: value };
  return value;
}

/**
 * An array of about one MiB of JSON held by a field. Each element nests so
 * that its deepest container sits `levels` levels down, the body counted.
 * `odd` replaces the element at `position`, the first or the last, when given.
 */
function wideAndDeepField(
  levels: number,
  container: Container,
  odd = levels,
  position: "first" | "last" = "first",
) {
  const element = (deepest: number) =>
    nestedField(deepest - BODY_AND_FIELD_LEVELS + 1, container);
  const bytes = JSON.stringify(element(levels)).length + 1;
  const count = Math.ceil(BODY_BYTES / bytes);
  const elements = Array.from({ length: count }, () => element(levels));
  elements[position === "first" ? 0 : elements.length - 1] = element(odd);
  return elements;
}

function saveRequest(gallery: FieldValue): AttachmentSaveRequest {
  return {
    context: untouchedRequestContext(),
    componentIds: [],
    fields: [FILE_FIELD],
    submitted: { gallery },
    before: {},
  };
}

/**
 * Saves `request`, answering the saved document or the HTTP refusal, with the
 * milliseconds it took and how many times the save callback ran.
 */
async function timedSave(request: AttachmentSaveRequest) {
  let saves = 0;
  const started = performance.now();
  try {
    const saved = await SaveComponentFiles(request, async (document) => {
      saves += 1;
      return { document, result: document };
    });
    return {
      saved,
      refusal: undefined,
      saves,
      ms: performance.now() - started,
    };
  } catch (error) {
    if (error instanceof HTTPResult)
      return {
        saved: undefined,
        refusal: error,
        saves,
        ms: performance.now() - started,
      };
    throw error;
  }
}

async function expectSavedWhole(gallery: FieldValue) {
  const { saved, refusal, ms } = await timedSave(saveRequest(gallery));
  expect(refusal).to.equal(undefined);
  expect(saved?.gallery).to.deep.equal(gallery);
  expect(ms).to.be.below(MAX_SAVE_MS);
}

async function expectRefusedInTime(gallery: FieldValue) {
  const { refusal, saves, ms } = await timedSave(saveRequest(gallery));
  expect(refusal?.getStatus()).to.equal(BAD_REQUEST);
  expect(refusal?.getBody()).to.equal(REFUSAL);
  expect(saves).to.equal(0);
  expect(ms).to.be.below(MAX_REFUSAL_MS);
}

describe("[unit] a submitted file field is bounded in width and in wide-and-deep size", function () {
  this.timeout(TEST_TIMEOUT_MS);

  describe("a field holding two hundred thousand entries", () => {
    it("in one array is saved whole in time", async () => {
      await expectSavedWhole(
        Array.from({ length: WIDTH }, (_, index) => index),
      );
    });

    it("in one object is saved whole in time", async () => {
      await expectSavedWhole(
        Object.fromEntries(
          Array.from({ length: WIDTH }, (_, index) => [`k${index}`, index]),
        ),
      );
    });
  });

  for (const container of CONTAINERS) {
    describe(`one MiB of ${container} elements`, () => {
      for (const levels of [MAX_DEPTH - 1, MAX_DEPTH]) {
        it(`nesting ${levels} levels deep is saved whole in time`, async () => {
          await expectSavedWhole(wideAndDeepField(levels, container));
        });
      }

      it(`nesting ${MAX_DEPTH + 1} levels deep answers 400 in time`, async () => {
        await expectRefusedInTime(wideAndDeepField(MAX_DEPTH + 1, container));
      });

      it(`with one ${MAX_DEPTH + 1}-level element first, found after every ${MAX_DEPTH}-level one, answers 400 in time`, async () => {
        await expectRefusedInTime(
          wideAndDeepField(MAX_DEPTH, container, MAX_DEPTH + 1),
        );
      });

      it(`with one ${MAX_DEPTH + 1}-level element last among ${MAX_DEPTH}-level siblings answers 400 and never runs the save callback`, async () => {
        await expectRefusedInTime(
          wideAndDeepField(MAX_DEPTH, container, MAX_DEPTH + 1, "last"),
        );
      });
    });
  }
});
