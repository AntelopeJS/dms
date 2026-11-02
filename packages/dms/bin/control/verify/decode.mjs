import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { decode } from "../json.mjs";

/**
 * Decoders for the JSON the verification harness reads back: results it
 * wrote, the verifier's judgement, the statuses GitHub answers and the
 * skill's config. A value that does not match is refused with an error that
 * names where it was read.
 */

const strings = z.array(z.string());

const rules = z.object({
  exitCode: z.number().nullable(),
  violated: strings,
  passing: strings,
});

/** The result `runFormalCheck` records in `result.json`. */
export const formalResultSchema =
  /** @satisfies {z.ZodType<import("./types.mjs").FormalResult>} */ (
    z.object({
      name: z.string(),
      exitCode: z.number().nullable(),
      violated: strings,
      passing: strings,
      folder: z.string(),
      commits: z
        .object({ baseSha: z.string(), headSha: z.string() })
        .optional(),
      behaviour: z
        .object({
          method: z.string(),
          changed: z.boolean(),
          removed: strings,
          added: strings,
        })
        .optional(),
      checkChanged: z.boolean().optional(),
      base: rules.nullable().optional(),
      fixed: strings.optional(),
      missing: strings.optional(),
    })
  );

const journeyCheck = z.object({
  name: z.string(),
  pass: z.boolean(),
  detail: z.string(),
});

/** The journey results a run records in `<feature>/feature.json`. */
export const featureResultsSchema =
  /** @satisfies {z.ZodType<import("./types.mjs").FeatureResult[]>} */ (
    z.array(
      z.object({
        feature: z.string(),
        journey: z.string(),
        title: z.string(),
        entryPoint: z.string(),
        status: z.enum(["PASS", "FAIL"]),
        database: z.string(),
        steps: z.array(
          z.object({ name: z.string(), checks: z.array(journeyCheck) }),
        ),
        error: z.string().nullable(),
        folder: z.string(),
      }),
    )
  );

/** The verifier's `judgement.json`. */
export const rawJudgementSchema =
  /** @satisfies {z.ZodType<import("./types.mjs").RawJudgement>} */ (
    z.object({
      verifier: z.string().optional(),
      notVerified: strings.optional(),
      attention: strings.optional(),
      docs: z
        .array(
          z.object({
            page: z.string(),
            matches: z.boolean().optional(),
            note: z.string().optional(),
          }),
        )
        .optional(),
      doors: z
        .object({
          none: z.string().optional(),
          rows: z
            .array(
              z.object({
                kind: z.string().optional(),
                location: z.string().optional(),
                irreversible: z.string().optional(),
                containment: z.string().optional(),
                containmentJourney: z.string().optional(),
              }),
            )
            .optional(),
          falsePositives: z
            .array(
              z.object({
                kind: z.string().optional(),
                location: z.string().optional(),
                reason: z.string().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    })
  );

/** What `gh api repos/<repo>/commits/<sha>/statuses` answers, as far as the harness reads it. */
export const commitStatusesSchema = z.array(
  z.object({ context: z.string(), state: z.string() }),
);

const regexOrNull = z.instanceof(RegExp).nullable();

const formalCheck = z.object({
  name: z.string(),
  covers: strings,
  files: strings.optional(),
  command: strings,
  baseCommand: strings.optional(),
  violation: regexOrNull,
  passing: regexOrNull,
  behaviour: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("emit") }),
      z.object({ kind: z.literal("probe"), command: strings }),
    ])
    .optional(),
});

const doorRule = z.object({
  globs: strings,
  funnels: strings,
  containments: strings,
  why: z.string(),
});

/** The default export of a skill's `verify.config.ts`. */
export const skillConfigSchema =
  /** @satisfies {z.ZodType<import("./skill.mjs").SkillConfig>} */ (
    z.object({
      playground: z.string(),
      prepare: z.array(strings),
      userFacing: strings,
      notUserFacing: strings.default([]),
      smoke: z.string(),
      smokeJourney: z.string(),
      doors: z.record(z.string(), doorRule.nullable()),
      formal: z.array(formalCheck),
    })
  );

/**
 * The journey results a run recorded for a feature.
 *
 * @param {string} file The feature's `feature.json`
 * @returns {import("./types.mjs").FeatureResult[]} The results, none when the journeys did not run
 * @throws When the file is not a list of journey results
 */
export function readFeatureResults(file) {
  if (!existsSync(file)) return [];
  /** @type {unknown} */
  const stored = JSON.parse(readFileSync(file, "utf8"));
  return decode(featureResultsSchema, stored, file);
}
