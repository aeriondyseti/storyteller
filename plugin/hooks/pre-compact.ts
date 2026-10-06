#!/usr/bin/env bun
import { runHook } from "./lib/io.ts";
import { preCompact } from "./lib/pre-compact.ts";

await runHook(preCompact);
