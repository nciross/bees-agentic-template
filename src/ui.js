import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const stdoutColor = () =>
  !("NO_COLOR" in process.env) && (process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== "0" : Boolean(process.stdout.isTTY));

const paint = (code) => (s) => (stdoutColor() ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = {
  honey: paint("38;2;255;195;0"),
  green: paint("32"),
  red: paint("31"),
  yellow: paint("33"),
  dim: paint("2"),
  bold: paint("1"),
};

export const log = {
  info: (msg) => console.log(msg),
  step: (msg) => console.log(`${c.honey("🐝")} ${msg}`),
  ok: (msg) => console.log(`${c.green("✔")} ${msg}`),
  warn: (msg) => console.warn(`${c.yellow("⚠")} ${msg}`),
  error: (msg) => console.error(`${c.red("✖")} ${msg}`),
};

export function banner() {
  if (!process.stdout.isTTY) return;
  const file = stdoutColor() ? "cli-banner.ansi" : "cli-banner-plain.txt";
  try {
    console.log(readFileSync(fileURLToPath(new URL(`../assets/${file}`, import.meta.url)), "utf8"));
  } catch {
    console.log(c.honey("bees · One hive, every agent."));
  }
}

const ACTION_MARK = { create: "+", update: "~", delete: "-" };
export function printChanges(changes, { prefix = "" } = {}) {
  for (const ch of changes) {
    const mark = ACTION_MARK[ch.action];
    const color = ch.action === "create" ? c.green : ch.action === "delete" ? c.red : c.yellow;
    console.log(`${prefix}${color(mark)} ${ch.path}${ch.note ? c.dim(`  (${ch.note})`) : ""}`);
  }
}

export const isInteractive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** Ask for a comma-separated subset of `choices`; Enter keeps `defaults`. */
export async function askList(question, choices, defaults) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (await rl.question(`${c.honey("?")} ${question} ${c.dim(`[${choices.join(", ")}]`)}\n  ${c.dim(`(Enter for ${defaults.join(", ")})`)} › `)).trim();
      if (!answer) return defaults;
      const picked = answer.split(/[\s,]+/).filter(Boolean);
      const unknown = picked.filter((p) => !choices.includes(p));
      if (!unknown.length) return [...new Set(picked)];
      console.log(c.red(`  Unknown: ${unknown.join(", ")}`));
    }
  } finally {
    rl.close();
  }
}
