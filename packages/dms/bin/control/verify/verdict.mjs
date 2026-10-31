import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { git } from "../git.mjs";
import { loadJourneys } from "../journey.mjs";
import { flaggedDoors } from "./doors.mjs";
import {
  formalGate,
  readFormalResult,
  touchedFormalChecks,
} from "./formal.mjs";
import { planFor } from "./map.mjs";
import { journeysFile } from "./skill.mjs";

const CONTAINED_KINDS = new Set(["data", "format"]);

/**
 * The GitHub `owner/repo` of the checkout's origin remote.
 *
 * @param {string} repo The checkout
 * @returns {string} The repository
 */
export function originRepository(repo) {
  const url = git(["remote", "get-url", "origin"], repo);
  const match = /github\.com[:/](.+?)(?:\.git)?$/.exec(url);
  if (!match) throw new Error(`origin ${url} is not a GitHub repository`);
  return match[1];
}

/**
 * @param {string} sha A commit
 * @returns {string} Its first seven characters
 */
function short(sha) {
  return sha.slice(0, 7);
}

/**
 * @param {string[]} entries The list items
 * @param {string} empty The item that stands for an empty list
 * @returns {string[]} The Markdown bullets
 */
function bullets(entries, empty) {
  return (entries.length > 0 ? entries : [empty]).map((entry) => `- ${entry}`);
}

/**
 * @param {import("../run-state.mjs").RunState} state The run
 * @param {string} feature The feature
 * @returns {import("./types.mjs").FeatureResult[]} The journey results the run recorded
 */
function readResults(state, feature) {
  const file = join(state.evidence, feature, "feature.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
}

/**
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {import("../run-state.mjs").RunState} state The run
 * @param {import("./types.mjs").Plan} plan The plan
 * @param {(path: string) => string} link The evidence link of a path
 * @returns {Promise<{ rows: string[], reasons: string[], byJourney: Map<string, import("./types.mjs").FeatureResult> }>} The table rows and why the verdict fails
 */
async function journeyRows(skill, state, plan, link) {
  /** @type {string[]} */
  const rows = [];
  /** @type {string[]} */
  const reasons = [];
  /** @type {Map<string, import("./types.mjs").FeatureResult>} */
  const byJourney = new Map();
  for (const feature of plan.run) {
    const results = readResults(state, feature);
    const file = journeysFile(skill, feature);
    const registered = existsSync(file)
      ? (await loadJourneys(file)).map((journey) => journey.id)
      : [];
    for (const id of registered.filter(
      (journey) => !results.some((result) => result.journey === journey),
    )) {
      reasons.push(`${feature}/${id} was not run`);
    }
    for (const result of results) {
      if (!registered.includes(result.journey))
        reasons.push(
          `${feature}/${result.journey} is not a registered journey`,
        );
      if (result.status === "FAIL")
        reasons.push(`${feature}/${result.journey} failed`);
      byJourney.set(`${feature}/${result.journey}`, result);
      const outcome = result.status === "PASS" ? "pass" : "**fail**";
      rows.push(
        `| ${feature} | \`${result.journey}\`: ${result.entryPoint} | ${outcome}: ${result.title} | [${result.folder}](${link(result.folder)}) |`,
      );
    }
  }
  return { rows, reasons, byJourney };
}

/**
 * @param {import("../run-state.mjs").RunState} state The run
 * @param {Map<string, import("./types.mjs").FeatureResult>} byJourney The results of this verdict's journeys
 * @param {string} id The containment journey, as `feature/journey`
 * @returns {import("./types.mjs").FeatureResult | undefined} Its result
 */
function containmentResult(state, byJourney, id) {
  const [feature, journey] = id.split("/");
  return (
    byJourney.get(id) ??
    readResults(state, feature).find((result) => result.journey === journey)
  );
}

/**
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {import("../run-state.mjs").RunState} state The run
 * @param {import("./types.mjs").Judgement} judgement The verifier's judgement
 * @param {Map<string, import("./types.mjs").FeatureResult>} byJourney The results of this verdict's journeys
 * @param {import("./types.mjs").Plan} plan The plan
 * @returns {string[]} Why the doors fail the verdict
 */
function doorReasons(skill, state, judgement, byJourney, plan) {
  /** @type {string[]} */
  const reasons = [];
  for (const row of judgement.doors.filter((door) =>
    CONTAINED_KINDS.has(door.kind),
  )) {
    const allowed = skill.config.doors[row.kind]?.containments ?? [];
    const journey = containmentResult(state, byJourney, row.containmentJourney);
    if (!allowed.includes(row.containmentJourney)) {
      reasons.push(
        `${row.kind} door at ${row.location} names ${row.containmentJourney || "no journey"}; its containment must be one of ${allowed.join(", ")}`,
      );
    } else if (journey?.status !== "PASS") {
      reasons.push(
        `${row.kind} door at ${row.location}: containment journey ${row.containmentJourney} did not pass in this run`,
      );
    }
  }
  for (const door of flaggedDoors(skill, plan.changed)) {
    for (const file of door.files) {
      const listed = judgement.doors.some(
        (row) => row.kind === door.kind && row.location.includes(file),
      );
      const dismissed = judgement.falsePositives.some(
        (entry) => entry.kind === door.kind && entry.location === file,
      );
      if (!listed && !dismissed) {
        reasons.push(
          `path rules flag a ${door.kind} door at ${file} that the One-way doors section neither lists nor dismisses`,
        );
      }
    }
  }
  return reasons;
}

/**
 * @param {import("./types.mjs").Judgement} judgement The verifier's judgement
 * @returns {string[]} The section's lines
 */
function doorsSection(judgement) {
  const dismissed = judgement.falsePositives.map(
    (entry) =>
      `- Not a door: \`${entry.location}\` matches the ${entry.kind} path rules. ${entry.reason}`,
  );
  if (judgement.doors.length === 0)
    return [`None: ${judgement.doorsNone}`, ...dismissed];
  return [
    ...dismissed,
    "| Kind | Location | What cannot be undone | Containment |",
    "|---|---|---|---|",
    ...judgement.doors.map((door) => {
      const journey = door.containmentJourney
        ? ` (journey \`${door.containmentJourney}\`)`
        : "";
      return `| ${door.kind} | \`${door.location}\` | ${door.irreversible} | ${door.containment}${journey} |`;
    }),
  ];
}

/**
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {import("../run-state.mjs").RunState} state The run
 * @param {import("./types.mjs").Plan} plan The plan
 * @param {(path: string) => string} link The evidence link of a path
 * @returns {{ reasons: string[], lines: string[] }} Why the formal checks fail the verdict, and their lines
 */
function formalSection(skill, state, plan, link) {
  const reasons = [];
  const lines = [];
  const touched = touchedFormalChecks(skill, plan.changed).map(
    (check) => check.name,
  );
  for (const check of skill.config.formal) {
    const result = readFormalResult(state, check.name);
    const gate = touched.includes(check.name);
    if (!result) {
      if (gate)
        reasons.push(
          `formal check ${check.name} covers the diff but was not run`,
        );
      continue;
    }
    if (gate && !result.behaviour && result.exitCode === 0) {
      reasons.push(
        `formal check ${check.name} covers the diff but its run did not compare the covered behaviour with the base`,
      );
    }
    const weight = formalGate(result);
    if (gate && weight.fails)
      reasons.push(`formal check ${check.name}: ${weight.outcome}`);
    const summary = gate
      ? weight.outcome
      : result.violated.length > 0
        ? `violated: ${result.violated.join(", ")}`
        : `exit ${result.exitCode}, no violated rule`;
    const role = gate
      ? "covers the diff, gates the verdict"
      : "does not cover the diff, informational";
    lines.push(
      `\`${check.name}\` (${role}): ${summary}. [evidence](${link(result.folder)})`,
    );
  }
  return { reasons, lines };
}

/**
 * @param {import("./types.mjs").Judgement} judgement The verifier's judgement
 * @param {import("./types.mjs").Plan} plan The plan
 * @returns {string[]} The docs pages that no longer match
 */
function docsReasons(judgement, plan) {
  return plan.docs.flatMap((page) => {
    const docs = judgement.docs.find((entry) => entry.page === page);
    if (!docs)
      throw new Error(
        `judgement.json: docs page ${page} of a touched feature has no judgement`,
      );
    return docs.matches ? [] : [`${page} no longer matches the behaviour`];
  });
}

/**
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {import("./types.mjs").VerdictCore} verdict The verdict
 * @param {{ plan: import("./types.mjs").Plan, judgement: import("./types.mjs").Judgement, journeys: Awaited<ReturnType<typeof journeyRows>>, formal: ReturnType<typeof formalSection>, reasons: string[], attention: string[], link: (path: string) => string }} parts What the verdict is rendered from
 * @returns {string} The verdict as Markdown
 */
function markdown(skill, verdict, parts) {
  const { plan, judgement, journeys, formal, reasons, attention, link } = parts;
  const touched = plan.touched.map(
    (entry) =>
      `\`${entry.feature}\` (diff: ${entry.files.map((file) => `\`${file}\``).join(", ")})`,
  );
  const docs = judgement.docs.map(
    (entry) =>
      `\`${entry.page}\`: ${entry.matches ? "matches" : "**stale**"}${entry.note ? `. ${entry.note}` : ""}`,
  );
  return [
    `## Verify: ${verdict.result}`,
    "",
    `**Head** \`${short(plan.headSha)}\` · **Skill** \`${skill.name}\` @ \`${short(verdict.skillSha)}\` (not trusted yet) · **Verifier** ${judgement.verifier}`,
    "",
    "### One-way doors",
    ...doorsSection(judgement),
    "",
    "### Touched features",
    ...bullets(touched, "none"),
    `- ${skill.config.smoke}: ${skill.config.smokeJourney}`,
    ...(plan.containments.length > 0
      ? [
          `- containment journeys of the Data and Format doors: ${plan.containments.map((feature) => `\`${feature}\``).join(", ")}`,
        ]
      : []),
    "",
    ...(plan.unmapped.length > 0
      ? [
          "### Unmapped surfaces",
          ...plan.unmapped.map(
            (file) =>
              `- \`${file}\` matches no feature glob; add it to a feature file.`,
          ),
          "",
        ]
      : []),
    ...(reasons.length > 0
      ? ["### Why it fails", ...reasons.map((reason) => `- ${reason}`), ""]
      : []),
    "### Journeys",
    "| Feature | Entry point | Result | Evidence |",
    "|---|---|---|---|",
    ...journeys.rows,
    "",
    "### Formal checks",
    ...bullets(formal.lines, "None ran."),
    "",
    "### Docs",
    ...bullets(docs, "No touched feature links a page."),
    "",
    "### Not verified",
    ...bullets(judgement.notVerified, "Nothing."),
    "",
    "### Attention",
    ...bullets(attention, "Nothing."),
    "",
    `Evidence: \`verify-evidence\` branch, [\`pr-${verdict.pr}/${plan.headSha}/\`](${link("")})`,
    "",
  ].join("\n");
}

/**
 * Computes the verdict of a run from its journey results, the diff plan,
 * the formal check results and the verifier's judgement, and writes
 * verdict.md, verdict.json and plan.json into the evidence folder.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {import("../run-state.mjs").RunState} state The run
 * @param {number} pr The pull request
 * @param {import("./types.mjs").Judgement} judgement The verifier's judgement
 * @returns {Promise<import("./types.mjs").Verdict>} The verdict
 */
export async function renderVerdict(skill, state, pr, judgement) {
  const plan = planFor(skill, state.baseRef);
  const skillSha =
    git(
      ["log", "-1", "--format=%H", "--", relative(skill.repo, skill.dir)],
      skill.repo,
    ) || plan.headSha;
  const repository = originRepository(skill.repo);
  /**
   * @param {string} path A path under the run's evidence
   * @returns {string} Its link on the evidence branch
   */
  const link = (path) =>
    `https://github.com/${repository}/tree/verify-evidence/pr-${pr}/${plan.headSha}/${path}`;
  const reasons = [];
  if (plan.headSha !== state.headSha) {
    reasons.push(
      `the run was created at ${short(state.headSha ?? "unknown")} but HEAD is ${short(plan.headSha)}`,
    );
  }
  const journeys = await journeyRows(skill, state, plan, link);
  const formal = formalSection(skill, state, plan, link);
  reasons.push(
    ...journeys.reasons,
    ...plan.unmapped.map((file) => `unmapped surface ${file}`),
    ...docsReasons(judgement, plan),
    ...doorReasons(skill, state, judgement, journeys.byJourney, plan),
    ...formal.reasons,
  );
  const attention = judgement.attention;
  const notes = judgement.notVerified.length + attention.length > 0;
  const result = reasons.length > 0 ? "FAIL" : notes ? "PASS+NOTES" : "PASS";
  const verdict = { result, headSha: plan.headSha, skillSha, pr, reasons };
  const text = markdown(skill, verdict, {
    plan,
    judgement,
    journeys,
    formal,
    reasons,
    attention,
    link,
  });
  writeFileSync(join(state.evidence, "verdict.md"), text);
  writeFileSync(
    join(state.evidence, "plan.json"),
    `${JSON.stringify(plan, null, 2)}\n`,
  );
  writeFileSync(
    join(state.evidence, "verdict.json"),
    `${JSON.stringify(verdict, null, 2)}\n`,
  );
  return { ...verdict, markdown: text };
}
