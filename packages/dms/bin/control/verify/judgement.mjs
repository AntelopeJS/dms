import { existsSync, readFileSync } from "node:fs";

function doorKind(skill, value, label) {
  if (!Object.hasOwn(skill.config.doors, value)) {
    throw new Error(
      `judgement.json: ${label} is "${value}", not one of ${Object.keys(skill.config.doors).join(", ")}`,
    );
  }
  return value;
}

function parseRows(skill, raw) {
  return (raw.doors?.rows ?? []).map((row, index) => {
    if (!row.kind || !row.location || !row.irreversible || !row.containment) {
      throw new Error(
        `judgement.json: doors.rows[${index}] needs kind, location, irreversible and containment`,
      );
    }
    return {
      ...row,
      kind: doorKind(skill, row.kind, `doors.rows[${index}].kind`),
      containmentJourney: row.containmentJourney ?? "",
    };
  });
}

function parseFalsePositives(skill, raw) {
  return (raw.doors?.falsePositives ?? []).map((entry, index) => {
    if (!entry.location || !entry.reason?.trim()) {
      throw new Error(
        `judgement.json: doors.falsePositives[${index}] needs location and reason`,
      );
    }
    return {
      ...entry,
      kind: doorKind(skill, entry.kind, `doors.falsePositives[${index}].kind`),
    };
  });
}

/**
 * Parses `evidence/judgement.json`, what only the verifier can judge. A
 * verdict without a One-way doors section is void, and one that does not
 * name its verifier is refused, so both throw.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {string} file The judgement file
 * @returns {{ notVerified: string[], attention: string[], docs: { page: string, matches: boolean, note: string }[], doorsNone: string | null, doors: Record<string, string>[], falsePositives: Record<string, string>[], verifier: string }} The judgement
 */
export function readJudgement(skill, file) {
  if (!existsSync(file)) {
    throw new Error(
      `${file} is missing: write the verifier's judgement before rendering the verdict`,
    );
  }
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const rows = parseRows(skill, raw);
  const none = raw.doors?.none?.trim() || null;
  if (!none && rows.length === 0) {
    throw new Error(
      "judgement.json: doors needs `none` with a reason or at least one row; a verdict without it is void",
    );
  }
  const verifier = raw.verifier?.trim();
  if (!verifier) {
    throw new Error(
      "judgement.json: verifier must say who judged this run, for example the verifier thread's URL",
    );
  }
  return {
    notVerified: raw.notVerified ?? [],
    attention: raw.attention ?? [],
    docs: (raw.docs ?? []).map((entry) => ({
      page: entry.page,
      matches: entry.matches === true,
      note: entry.note ?? "",
    })),
    doorsNone: none,
    doors: rows,
    falsePositives: parseFalsePositives(skill, raw),
    verifier,
  };
}
