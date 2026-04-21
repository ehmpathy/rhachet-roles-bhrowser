/**
 * .what = repeatably config for LLM-based tests
 * .why = LLM outputs are probabilistic; test mode uses SOME (any 1 of 3)
 *
 * .note = CI and LOCALLY both indicate test mode where flake tolerance is needed
 */
export const REPEATABLY_CONFIG_LLM = {
  attempts: 3,
  criteria: process.env.CI || process.env.LOCALLY ? 'SOME' : 'EVERY',
} as const;
