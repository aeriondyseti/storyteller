#!/usr/bin/env bun
// Rewrites every lore entry with every field explicit (spec 20.8). Safe to run
// again: entries already migrated are left byte for byte.
//
//   bun scripts/migrate-lore.ts <story or library folder> [more folders...]
//
// For a player's home:
//   bun scripts/migrate-lore.ts ~/.storyteller/stories/* ~/.storyteller/library

import { migrateLore } from "../src/migrate-lore.ts";

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("usage: bun scripts/migrate-lore.ts <story or library folder> [more folders...]");
  process.exit(2);
}

let invalid = 0;
for (const dir of dirs) {
  const result = await migrateLore(dir);
  const count = (status: string) => result.files.filter((f) => f.status === status).length;
  console.log(
    `${result.dir} (${result.kind}, known: ${result.known}): ${result.files.length} entries, ` +
      `${count("rewritten")} rewritten, ${count("unchanged")} unchanged, ${count("invalid")} invalid`,
  );
  for (const f of result.files) {
    if (f.status === "invalid") console.log(`  invalid, left alone: ${f.file}: ${f.message}`);
  }
  invalid += count("invalid");
}
process.exit(invalid > 0 ? 1 : 0);
