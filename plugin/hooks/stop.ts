#!/usr/bin/env bun
import { runHook } from "./lib/io.ts";
import { stop } from "./lib/stop.ts";

await runHook(stop);
