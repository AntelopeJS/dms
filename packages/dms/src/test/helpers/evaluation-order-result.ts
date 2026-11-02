import { z } from "zod";
import type { EvaluationOrderResult } from "../unit/interfaces/dms-base/table-view-evaluation-order.fixture";

const EvaluationOrderSchema = z.object({
  published: z.array(z.string()),
  present: z.array(z.string()),
  pageTopics: z.array(z.string()),
}) satisfies z.ZodType<EvaluationOrderResult>;

/** Decodes what the evaluation-order fixture process printed on stdout. */
export function parseEvaluationOrderResult(
  stdout: string,
): EvaluationOrderResult {
  return EvaluationOrderSchema.parse(JSON.parse(stdout));
}
