import { HTTPResult } from "@antelopejs/interface-api";
import type {
  AttachmentField,
  AttachmentSaveRequest,
} from "@antelopejs/interface-dms/attachments";
import { expect } from "chai";
import { SaveComponentFiles } from "../../attachments";
import { untouchedRequestContext } from "../helpers/request-context";

const MAX_DEPTH = 64;
const TOO_DEEP = 10_000;
const BAD_REQUEST = 400;
const REFUSAL = "The JSON body nests more than 64 levels deep.";
const CONTAINERS = ["array", "object"] as const;

const FILE_FIELD: AttachmentField = {
  id: "gallery",
  key: "gallery",
  kind: "file",
};
const IMAGE_FIELD: AttachmentField = {
  id: "cover",
  key: "cover",
  kind: "image",
};

/**
 * The value of a submitted field whose body nests arrays or objects `levels`
 * deep, the body itself counted. It ends in `null`, which holds no reference.
 */
function nestedField(levels: number, container: (typeof CONTAINERS)[number]) {
  let value = null;
  for (let level = 2; level <= levels; level += 1)
    value = container === "array" ? [value] : { child: value };
  return value;
}

function saveRequest(
  body: Pick<AttachmentSaveRequest, "fields" | "submitted">,
): AttachmentSaveRequest {
  return {
    context: untouchedRequestContext(),
    componentIds: [],
    ...body,
    before: {},
  };
}

/**
 * Saves `request` and answers the document the save callback received, or
 * `undefined` when the save never ran, with the HTTP refusal if there was one.
 */
async function attempt(request: AttachmentSaveRequest) {
  let saves = 0;
  try {
    const saved = await SaveComponentFiles(request, async (document) => {
      saves += 1;
      return { document, result: document };
    });
    return { saved, saves, refusal: undefined };
  } catch (error) {
    if (error instanceof HTTPResult)
      return { saved: undefined, saves, refusal: error };
    throw error;
  }
}

async function savedDocument(request: AttachmentSaveRequest) {
  return (await attempt(request)).saved;
}

async function expectDepthRefusal(request: AttachmentSaveRequest) {
  const { saves, refusal } = await attempt(request);
  expect(refusal?.getStatus()).to.equal(BAD_REQUEST);
  expect(refusal?.getBody()).to.equal(REFUSAL);
  expect(saves).to.equal(0);
}

describe("[unit] a submitted file field is bounded in depth", () => {
  for (const container of CONTAINERS) {
    it(`a field nested ${TOO_DEEP} ${container} levels deep answers 400 and never saves`, async () => {
      await expectDepthRefusal(
        saveRequest({
          fields: [FILE_FIELD],
          submitted: {
            gallery: nestedField(TOO_DEEP, container),
          },
        }),
      );
    });

    it(`a field nested ${MAX_DEPTH + 1} ${container} levels deep answers 400`, async () => {
      await expectDepthRefusal(
        saveRequest({
          fields: [FILE_FIELD],
          submitted: {
            gallery: nestedField(MAX_DEPTH + 1, container),
          },
        }),
      );
    });

    it(`a field nested ${MAX_DEPTH} ${container} levels deep is saved whole`, async () => {
      const submitted = { gallery: nestedField(MAX_DEPTH, container) };
      const saved = await savedDocument(
        saveRequest({ fields: [FILE_FIELD], submitted: submitted }),
      );
      expect(saved).to.deep.equal(submitted);
      expect(JSON.stringify(saved)).to.equal(JSON.stringify(submitted));
    });
  }

  it("any one declared field nested too deep refuses the save", async () => {
    await expectDepthRefusal(
      saveRequest({
        fields: [FILE_FIELD, IMAGE_FIELD],
        submitted: {
          gallery: nestedField(MAX_DEPTH, "array"),
          cover: nestedField(MAX_DEPTH + 1, "object"),
        },
      }),
    );
  });

  it("a deep field nested in a wide value is found among its shallow siblings", async () => {
    const deep = nestedField(MAX_DEPTH, "array");
    await expectDepthRefusal(
      saveRequest({
        fields: [FILE_FIELD],
        submitted: {
          gallery: [1, [2, [3]], { a: [], b: {} }, [deep], "x"],
        },
      }),
    );
  });

  it("a field that is not declared is not walked, however deep it nests", async () => {
    const submitted = { note: nestedField(TOO_DEEP, "array"), gallery: null };
    const saved = await savedDocument(
      saveRequest({ fields: [FILE_FIELD], submitted: submitted }),
    );
    expect(saved?.note).to.equal(submitted.note);
  });

  it("shallow and mixed bodies keep their keys, order and shape", async () => {
    const submitted = {
      zeta: "last declared first",
      cover: {
        label: "front",
        tags: ["a", ["b", { c: [null, true, 0, 1.5] }], {}, []],
        size: { width: 3, height: 4, nested: { empty: {} } },
        missing: null,
        flag: false,
      },
      alpha: [{ x: 1 }, { x: 2 }],
    };
    const saved = await savedDocument(
      saveRequest({ fields: [IMAGE_FIELD], submitted: submitted }),
    );
    expect(saved).to.deep.equal(submitted);
    expect(JSON.stringify(saved)).to.equal(JSON.stringify(submitted));
    expect(Object.keys(saved ?? {})).to.deep.equal(Object.keys(submitted));
  });
});
