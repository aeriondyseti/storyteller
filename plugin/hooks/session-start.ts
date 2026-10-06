#!/usr/bin/env bun
import { runHook } from "./lib/io.ts";
import { sessionStart } from "./lib/session-start.ts";

await runHook(sessionStart);
