import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel } from "@antelopejs/interface-dms/db";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { UserNotificationsModel } from "../../../db/models";
import { MOCKUP_REVIEW_PERMISSION_ID } from "../../../mockup";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { MOCKUP_API, serveMockupRoutes } from "../../helpers/mockup-routes";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

const DESK = `${MOCKUP_API}/desk`;
const ANNOTATIONS = `${DESK}/annotations`;
const PLACE = {
  page: "home",
  path: "/pages/0/tree/0",
  offset: { x: 0.5, y: 0.5 },
};
/** Where the notifications about a note on the home page send their reader. */
const LINK = "/mockup?name=desk&page=home";
const REVIEWER_NAME = "Claire Client";

const SPEC_JSON = {
  version: 1,
  title: "Order desk",
  pages: [
    {
      id: "home",
      title: "Home",
      fixtures: { orders: [{ _id: "o1" }] },
      tree: [{ type: "KpiCard", options: { title: "Revenue" } }],
    },
  ],
};
const SPEC = JSON.stringify(SPEC_JSON);

const authorSchema = z.object({ userId: z.string(), name: z.string() });
const replySchema = z.object({
  id: z.string(),
  author: authorSchema,
  text: z.string(),
});
const noteSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: z.enum(["open", "resolved"]),
  author: authorSchema.optional(),
  resolvedBy: authorSchema.optional(),
  replies: z.array(replySchema),
});
const listSchema = z.object({ annotations: z.array(noteSchema) });
const accessSchema = z.object({
  role: z.enum(["owner", "reviewer"]),
  userId: z.string(),
  name: z.string(),
});

/** The owner and a reviewer of the served mockup, each signed in. */
interface ReviewSuite {
  owner: AxiosInstance;
  ownerId: string;
  reviewer: AxiosInstance;
  reviewerId: string;
}

/**
 * Serves the mockup for the enclosing suite, and signs in a member whose role
 * holds the review permission and nothing else. Every comment left is removed
 * after each test.
 */
function useReviewSuite(): () => ReviewSuite {
  const served = serveMockupRoutes(SPEC);
  let suite: ReviewSuite | undefined;

  before(async () => {
    const { owner, ownerId } = served();
    const [role] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
      name: `Reviews mockups as ${REVIEWER_NAME}`,
      permissions: [MOCKUP_REVIEW_PERMISSION_ID],
    });
    const user = await registerUser({ roles_ids: [role], name: REVIEWER_NAME });
    suite = {
      owner,
      ownerId,
      reviewer: authorizedClient(user.accessToken),
      reviewerId: user.userId,
    };
  });

  afterEach(async () => {
    if (!suite) return;
    for (const { id } of await listed(suite.owner)) {
      await suite.owner.delete(`${ANNOTATIONS}/${id}`);
    }
  });

  return () => {
    if (!suite) throw new Error("The suite's before hook has not run yet");
    return suite;
  };
}

async function pin(client: AxiosInstance, text: string) {
  const answer = await client.post(ANNOTATIONS, { ...PLACE, text });
  expect(answer.status, JSON.stringify(answer.data)).to.equal(HTTP_OK);
  return noteSchema.parse(answer.data);
}

async function listed(client: AxiosInstance) {
  return listSchema.parse((await client.get(ANNOTATIONS)).data).annotations;
}

function noteOf(answer: { data: unknown }) {
  return noteSchema.parse(answer.data);
}

async function statuses(answers: Promise<{ status: number }>[]) {
  return (await Promise.all(answers)).map((answer) => answer.status);
}

/** The notifications `userId` received, oldest first: each one's title key, actor, quoted text and link. */
async function heard(userId: string): Promise<string[][]> {
  const rows = await GetModel(UserNotificationsModel).getByUserId(userId);
  return rows
    .reverse()
    .map((row) => [
      row.title.replace("$dms.notifications.messages.", ""),
      String(row.params?.actor ?? ""),
      String(row.params?.text ?? ""),
      row.linkTo ?? "",
    ]);
}

describe("[unit] mockup routes: a reviewer's access", () => {
  const suite = useReviewSuite();

  it("reaches what draws a mockup and its comments, and is refused what writes, locks, lists versions or manages one (fails when the review permission opens the owner's routes)", async () => {
    const { reviewer } = suite();

    const opened = await statuses([
      reviewer.get(MOCKUP_API),
      reviewer.get(DESK),
      reviewer.get(ANNOTATIONS),
      reviewer.get(`${DESK}/pages/home/fixtures/orders`),
      reviewer.get(`${DESK}/pages/home/fixtures/orders/rows`),
    ]);
    const refused = await statuses([
      reviewer.get(`${DESK}/spec`),
      reviewer.put(`${DESK}/spec`, { spec: SPEC_JSON }),
      reviewer.put(`${DESK}/locks`, { viewer: "x", path: PLACE.path }),
      reviewer.get(`${DESK}/history`),
      reviewer.patch(DESK, { title: "Mine" }),
      reviewer.post(`${DESK}/duplicate`, {}),
      reviewer.delete(DESK),
      reviewer.get(`${MOCKUP_API}/schema`),
      reviewer.get(`${MOCKUP_API}/example`),
      reviewer.post(`${MOCKUP_API}/from-page`, { path: "/orders" }),
    ]);

    expect(opened).to.deep.equal(opened.map(() => HTTP_OK));
    expect(refused).to.deep.equal(refused.map(() => HTTP_FORBIDDEN));
  });

  it("answers each caller's role, and 404 for a mockup that does not exist (fails when the viewer cannot tell a reviewer from the owner)", async () => {
    const { owner, ownerId, reviewer, reviewerId } = suite();

    const reviewed = accessSchema.parse(
      (await reviewer.get(`${DESK}/access`)).data,
    );
    const owned = accessSchema.parse((await owner.get(`${DESK}/access`)).data);
    const ghost = await owner.get(`${MOCKUP_API}/ghost/access`);

    expect(reviewed).to.deep.equal({
      role: "reviewer",
      userId: reviewerId,
      name: REVIEWER_NAME,
    });
    expect(owned).to.include({ role: "owner", userId: ownerId });
    expect(ghost.status).to.equal(HTTP_NOT_FOUND);
  });
});

describe("[unit] mockup routes: a reviewer's comments", () => {
  const suite = useReviewSuite();

  it("signs each comment with its author, and lets a reviewer resolve and reopen the owner's comment but neither rewrite, move nor delete it (fails when a reviewer can change another's note)", async () => {
    const { owner, ownerId, reviewer, reviewerId } = suite();
    const theirs = await pin(owner, "Owner's note");
    const mine = await pin(reviewer, "Client's note");
    const note = `${ANNOTATIONS}/${theirs.id}`;

    const rewritten = await reviewer.patch(note, { text: "Rewritten" });
    const refused = await statuses([
      reviewer.patch(note, { place: { page: "home", offset: { x: 0, y: 0 } } }),
      reviewer.delete(note),
    ]);
    const resolved = noteOf(await reviewer.patch(note, { status: "resolved" }));
    const reopened = noteOf(await reviewer.patch(note, { status: "open" }));

    expect(theirs.author).to.deep.include({ userId: ownerId });
    expect(mine.author).to.deep.equal({
      userId: reviewerId,
      name: REVIEWER_NAME,
    });
    expect(rewritten.status).to.equal(HTTP_FORBIDDEN);
    expect(rewritten.data).to.deep.equal({
      message: "$dms.refusals.mockup.note_not_yours",
    });
    expect(refused).to.deep.equal([HTTP_FORBIDDEN, HTTP_FORBIDDEN]);
    expect(resolved).to.include({ status: "resolved" });
    expect(resolved.resolvedBy).to.deep.equal({
      userId: reviewerId,
      name: REVIEWER_NAME,
    });
    expect(reopened).to.include({ status: "open" });
    expect(reopened).to.not.have.property("resolvedBy");
    expect((await listed(owner)).map(({ text }) => text)).to.deep.equal([
      "Owner's note",
      "Client's note",
    ]);
  });

  it("lets a reviewer rewrite, move and delete their own comment, and the owner anyone's (fails when a reviewer is refused their own note)", async () => {
    const { owner, reviewer } = suite();
    const mine = await pin(reviewer, "Client's note");
    const other = await pin(reviewer, "Client's other note");

    const rewritten = noteOf(
      await reviewer.patch(`${ANNOTATIONS}/${mine.id}`, {
        text: "Client's note, sharper",
      }),
    );
    const moved = await reviewer.patch(`${ANNOTATIONS}/${mine.id}`, {
      place: { page: "home", offset: { x: 0.1, y: 0.9 } },
    });
    const removed = await reviewer.delete(`${ANNOTATIONS}/${mine.id}`);
    const removedByOwner = await owner.delete(`${ANNOTATIONS}/${other.id}`);

    expect(rewritten.text).to.equal("Client's note, sharper");
    expect(moved.status).to.equal(HTTP_OK);
    expect(removed.data).to.deep.equal({ id: mine.id });
    expect(removedByOwner.data).to.deep.equal({ id: other.id });
    expect(await listed(owner)).to.deep.equal([]);
  });
});

describe("[unit] mockup routes: replies and notifications", () => {
  const suite = useReviewSuite();

  it("threads replies under a comment, each signed, which their author and the owner delete and nobody else (fails when a reviewer deletes the owner's reply)", async () => {
    const { owner, ownerId, reviewer, reviewerId } = suite();
    const note = await pin(reviewer, "Make the card wider");
    const replies = `${ANNOTATIONS}/${note.id}/replies`;

    const byOwner = noteOf(await owner.post(replies, { text: "How wide?" }));
    const byClient = noteOf(
      await reviewer.post(replies, { text: "Full width" }),
    );
    const [ownerReply, clientReply] = byClient.replies;
    const refused = await reviewer.delete(`${replies}/${ownerReply.id}`);
    const blank = await reviewer.post(replies, { text: "   " });
    const deletedOwn = noteOf(
      await reviewer.delete(`${replies}/${clientReply.id}`),
    );
    const deletedByOwner = noteOf(
      await owner.delete(`${replies}/${ownerReply.id}`),
    );
    const gone = await owner.delete(`${replies}/${ownerReply.id}`);

    expect(byOwner.replies.map(({ text }) => text)).to.deep.equal([
      "How wide?",
    ]);
    expect(
      byClient.replies.map(({ text, author }) => [text, author.userId]),
    ).to.deep.equal([
      ["How wide?", ownerId],
      ["Full width", reviewerId],
    ]);
    expect(refused.status).to.equal(HTTP_FORBIDDEN);
    expect(refused.data).to.deep.equal({
      message: "$dms.refusals.mockup.reply_not_yours",
    });
    expect(blank.status).to.equal(HTTP_BAD_REQUEST);
    expect(deletedOwn.replies.map(({ id }) => id)).to.deep.equal([
      ownerReply.id,
    ]);
    expect(deletedByOwner.replies).to.deep.equal([]);
    expect(gone.status).to.equal(HTTP_NOT_FOUND);
  });

  it("tells the owner of a reviewer's comment and reply, and the reviewer of the owner's reply and resolution, never the one who acted (fails when the actor hears their own action or the owner's note pings anyone)", async () => {
    const { owner, ownerId, reviewer, reviewerId } = suite();
    const ownerBefore = (await heard(ownerId)).length;
    const clientBefore = (await heard(reviewerId)).length;

    const note = await pin(reviewer, "Move the total up");
    const replies = `${ANNOTATIONS}/${note.id}/replies`;
    await owner.post(replies, { text: "Done in v2" });
    await reviewer.post(replies, { text: "Thanks" });
    await owner.patch(`${ANNOTATIONS}/${note.id}`, { status: "resolved" });
    const ownerNote = await pin(owner, "Note to self");
    await owner.patch(`${ANNOTATIONS}/${ownerNote.id}`, { status: "resolved" });

    expect((await heard(ownerId)).slice(ownerBefore)).to.deep.equal([
      ["mockup_comment.title", REVIEWER_NAME, "Move the total up", LINK],
      ["mockup_reply.title", REVIEWER_NAME, "Thanks", LINK],
    ]);
    expect((await heard(reviewerId)).slice(clientBefore)).to.deep.equal([
      ["mockup_reply.title", "Test User", "Done in v2", LINK],
      ["mockup_comment_resolved.title", "Test User", "Move the total up", LINK],
    ]);
  });
});
