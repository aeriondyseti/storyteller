#!/usr/bin/env bun
import { runHook } from "./lib/io.ts";
import { userPromptSubmit } from "./lib/user-prompt-submit.ts";

await runHook(userPromptSubmit);
