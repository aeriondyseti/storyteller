#!/usr/bin/env bun
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Runs the mod's tests (plugin/mod/*.test.tsx) through `claude plugin test`.
//
// `claude plugin test <dir>` runs every *.test.ts under the plugin folder in
// the mod's own environment, which would sweep in plugin/hooks' bun tests and
// fail them. So the mod is staged alone: the manifest, plugin/mod, and a
// hooks.json naming the module, in a temporary folder.
//
//   bun scripts/test-mod.ts

const plugin = path.join(import.meta.dir, "..", "plugin");
const stage = await mkdtemp(path.join(os.tmpdir(), "rp-mod-"));
try {
  await mkdir(path.join(stage, ".claude-plugin"), { recursive: true });
  await cp(
    path.join(plugin, ".claude-plugin", "plugin.json"),
    path.join(stage, ".claude-plugin", "plugin.json"),
  );
  await cp(path.join(plugin, "mod"), path.join(stage, "mod"), {
    recursive: true,
    filter: (src) => !src.endsWith("tsconfig.json"),
  });
  await Bun.write(
    path.join(stage, "hooks", "hooks.json"),
    JSON.stringify({ modules: ["../mod/register.tsx"] }),
  );
  const proc = Bun.spawn(["claude", "plugin", "test", stage], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exitCode = await proc.exited;
} finally {
  await rm(stage, { recursive: true, force: true });
}
