import type { Directive } from "./story.ts";

// Bible deltas (spec 6). The engine snapshots the system prompt once per
// conversation, so a directive switched or edited mid-session reaches the
// model only through the turn. The record holds a hash per directive:
//
//   inForce  directives the bible renders in full (on, not keyed)
//   keyed    keyed directives switched on, which activation injects by key
//
// With no record (a new session, or just after a compaction) the bible was
// rendered from the same files moments ago: record the set and say nothing.

export type DirectiveRecord = {
  inForce: Record<string, string>;
  keyed: Record<string, string>;
};

export type DirectiveDeltas = {
  // Empty when nothing in force changed.
  block: string;
  record: DirectiveRecord;
  // Keyed directives that are new or edited since the record: the caller
  // lifts their activation cooldown so the new body is not held back.
  changedKeyed: string[];
};

export function directiveRecord(directives: readonly Directive[]): DirectiveRecord {
  const inForce: Record<string, string> = {};
  const keyed: Record<string, string> = {};
  for (const d of directives) {
    if (!d.on) continue;
    if (d.mode === "keyed") keyed[d.ref] = directiveHash(d);
    else inForce[d.ref] = directiveHash(d);
  }
  return { inForce, keyed };
}

export function directiveDeltas(
  directives: readonly Directive[],
  previous: DirectiveRecord | undefined,
): DirectiveDeltas {
  const record = directiveRecord(directives);
  if (!previous) return { block: "", record, changedKeyed: [] };

  const changedKeyed = Object.keys(record.keyed).filter(
    (ref) => previous.keyed[ref] !== record.keyed[ref],
  );
  const inForce = directives.filter((d) => record.inForce[d.ref] !== undefined);
  const changed = inForce.filter((d) => previous.inForce[d.ref] !== record.inForce[d.ref]);
  const off = Object.keys(previous.inForce).filter((ref) => record.inForce[ref] === undefined);
  if (changed.length === 0 && off.length === 0) return { block: "", record, changedKeyed };

  // A directive switched off may also have been deleted; its ref stands in.
  const titleOf = (ref: string) => directives.find((d) => d.ref === ref)?.title ?? ref;
  const parts = [
    "Directives changed since the bible was written:",
    `Now in force: ${inForce.map((d) => d.title).join(", ") || "none"}.`,
    ...changed.map((d) => `\n### ${d.title} (${d.mode})\n\n${d.body.trim()}`),
  ];
  if (off.length) {
    parts.push(`${changed.length ? "\n" : ""}Switched off: ${off.map(titleOf).join(", ")}.`);
  }
  return { block: parts.join("\n"), record, changedKeyed };
}

function directiveHash(d: Directive): string {
  return Bun.hash(JSON.stringify([d.title, d.mode, d.keys, d.body])).toString(16);
}
