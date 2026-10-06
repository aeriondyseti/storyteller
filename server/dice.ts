import { ToolError } from "./context.ts";

// Dice notation for the roll tool: terms joined by + or -, each either a
// constant or NdM with an optional keep-highest/lowest (2d20kh1, 4d6kh3,
// 2d20kl1). "d20" means 1d20.

export type DieTerm = {
  sign: 1 | -1;
  notation: string;
  rolls: number[];
  kept: number[];
  total: number;
};

export type RollResult = { expr: string; terms: DieTerm[]; total: number };

export type Rng = () => number;

const maxDice = 100;
const maxSides = 1000;
const term = /^(\d*)d(\d+)(?:(kh|kl)(\d+))?$/;

export function roll(expr: string, rng: Rng = Math.random): RollResult {
  const clean = expr.toLowerCase().replace(/\s+/g, "");
  if (!clean) throw new ToolError("Give a dice expression, like 2d6+1 or 2d20kh1.");
  const parts = clean.match(/[+-]?[^+-]+/g) ?? [];
  if (parts.join("") !== clean) throw badExpr(expr);
  const terms = parts.map((part) => rollTerm(part, rng, expr));
  return { expr: clean, terms, total: terms.reduce((sum, t) => sum + t.sign * t.total, 0) };
}

function rollTerm(part: string, rng: Rng, expr: string): DieTerm {
  const sign = part.startsWith("-") ? -1 : 1;
  const body = part.replace(/^[+-]/, "");
  if (/^\d+$/.test(body)) {
    const n = Number(body);
    return { sign, notation: body, rolls: [], kept: [], total: n };
  }
  const m = term.exec(body);
  if (!m) throw badExpr(expr);
  const count = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  if (count < 1 || count > maxDice) throw new ToolError(`Roll between 1 and ${maxDice} dice.`);
  if (sides < 2 || sides > maxSides) {
    throw new ToolError(`Dice need between 2 and ${maxSides} sides.`);
  }
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(rng() * sides));
  let kept = rolls;
  if (m[3]) {
    const keep = Number(m[4]);
    if (keep < 1 || keep > count) {
      throw new ToolError(`Can keep between 1 and ${count} of ${count} dice.`);
    }
    const sorted = [...rolls].sort((a, b) => (m[3] === "kh" ? b - a : a - b));
    kept = sorted.slice(0, keep);
  }
  return { sign, notation: body, rolls, kept, total: kept.reduce((a, b) => a + b, 0) };
}

function badExpr(expr: string): ToolError {
  return new ToolError(
    `Cannot read "${expr}". Use dice notation like d20, 2d6+1, 4d6kh3 or 2d20kl1.`,
  );
}

export function formatRoll(result: RollResult): string {
  const pieces = result.terms.map((t, i) => {
    const op = i === 0 ? (t.sign < 0 ? "-" : "") : t.sign < 0 ? " - " : " + ";
    if (t.rolls.length === 0) return `${op}${t.total}`;
    const dropped = t.kept.length < t.rolls.length ? ` keep ${t.kept.join(", ")}` : "";
    return `${op}${t.notation} [${t.rolls.join(", ")}]${dropped}`;
  });
  return `${result.expr}: ${pieces.join("")} = ${result.total}`;
}
