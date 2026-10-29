import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { git } from "../git.mjs";
import { loadJourneys } from "../journey.mjs";
import { flaggedDoors } from "./doors.mjs";
import { readFormalResult, touchedFormalChecks } from "./formal.mjs";
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

function short(sha) {
  return sha.slice(0, 7);
}

function bullets(entries, empty) {
  return (entries.length > 0 ? entries : [empty]).map((entry) => `- ${entry}`);
}

function readResults(state, feature) {
  const file = join(state.evidence, feature, "feature.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
}

async function journeyRows(skill, state, plan, link) {
  const rows = [];
  const reasons = [];
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

function doorReasons(skill, judgement, byJourney, plan) {
  const reasons = [];
  for (const row of judgement.doors.filter((door) =>
    CONTAINED_KINDS.has(door.kind),
  )) {
    const allowed = skill.config.doors[row.kind]?.containments ?? [];
    const journey = byJourney.get(row.containmentJourney);
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
    const toolError = result.violated.length === 0 && result.exitCode !== 0;
    if (gate && (result.violated.length > 0 || toolError)) {
      reasons.push(
        `formal check ${check.name}: ${result.violated.length > 0 ? `violated ${result.violated.join(", ")}` : `tool error, exit ${result.exitCode}`}`,
      );
    }
    const summary =
      result.violated.length > 0
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
 * @param {Record<string, any>} skill The skill
 * @param {Record<string, any>} state The run
 * @param {number} pr The pull request
 * @param {Record<string, any>} judgement The verifier's judgement
 * @returns {Promise<{ result: string, headSha: string, skillSha: string, pr: number, markdown: string, reasons: string[] }>} The verdict
 */
export async function renderVerdict(skill, state, pr, judgement) {
  const plan = planFor(skill, state.baseRef);
  const skillSha =
    git(
      ["log", "-1", "--format=%H", "--", relative(skill.repo, skill.dir)],
      skill.repo,
    ) || plan.headSha;
  const repository = originRepository(skill.repo);
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
    ...doorReasons(skill, judgement, journeys.byJourney, plan),
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
