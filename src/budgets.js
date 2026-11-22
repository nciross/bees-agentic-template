// Token budgets from the `tokens` key of bees.yaml (no imports: config.js loads this).
export const DEFAULT_BUDGETS = { "always-loaded": 3000, skill: 2000, agent: 1500, command: 1000 };
const BUDGET_KEYS = Object.keys(DEFAULT_BUDGETS);

/** Validate the `tokens` key of bees.yaml. Returns { budgets, errors, warnings }. */
export function validateBudgets(raw) {
  const budgets = { ...DEFAULT_BUDGETS };
  const errors = [];
  const warnings = [];
  if (raw == null) return { budgets, errors, warnings };
  if (typeof raw !== "object" || Array.isArray(raw)) return { budgets, errors: ["`tokens` must be a mapping, e.g. { always-loaded: 3000 }."], warnings };
  for (const [k, v] of Object.entries(raw)) {
    if (!BUDGET_KEYS.includes(k)) warnings.push(`Unknown key \`tokens.${k}\` is ignored. Known: ${BUDGET_KEYS.join(", ")}.`);
    else if (!Number.isInteger(v) || v <= 0) errors.push(`\`tokens.${k}\` must be a positive whole number of tokens.`);
    else budgets[k] = v;
  }
  return { budgets, errors, warnings };
}

