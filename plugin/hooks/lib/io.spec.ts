import { describe, expect, test } from "bun:test";
import { copyStory, saltmereDir, tempDir } from "../../../src/testing/fixtures.ts";
import { handle } from "./io.ts";
import { readState, statePath, writeState } from "./state.ts";

describe("handle", () => {
  test("passes the parsed input to the handler and returns its output", async () => {
    const raw = JSON.stringify({
      cwd: "/x",
      hook_event_name: "Stop",
      stop_hook_active: true,
      prompt: "hi",
    });
    const out = await handle(raw, async (input) => JSON.stringify(input));
    expect(JSON.parse(out)).toEqual({ cwd: "/x", prompt: "hi" });
  });

  test("swallows a failure and logs it in the story's .rp folder", async () => {
    const dir = await copyStory(saltmereDir);
    const out = await handle(JSON.stringify({ cwd: dir }), async () => {
      throw new Error("boom");
    });
    expect(out).toBe("");
    expect(await Bun.file(`${dir}/.rp/hook-errors.log`).text()).toContain("boom");
  });

  test("swallows unreadable input", async () => {
    expect(await handle("not json", async () => "never")).toBe("");
    expect(await handle("{}", async () => "never")).toBe("");
  });
});

describe("state", () => {
  test("round-trips and starts fresh from a missing or damaged file", async () => {
    const dir = await tempDir();
    expect(await readState(dir)).toEqual({ turn: 0, injections: [], lastLogged: undefined });
    await writeState(dir, {
      turn: 2,
      injections: [{ ref: "lore/a", turn: 1, hash: "h", chars: 3 }],
      lastLogged: "u1",
    });
    expect(await readState(dir)).toEqual({
      turn: 2,
      injections: [{ ref: "lore/a", turn: 1, hash: "h", chars: 3 }],
      lastLogged: "u1",
    });
    await Bun.write(statePath(dir), "{ torn");
    expect(await readState(dir)).toEqual({ turn: 0, injections: [], lastLogged: undefined });
  });

  test("keeps keys it does not own, such as the notes job's", async () => {
    const dir = await tempDir();
    await Bun.write(statePath(dir), JSON.stringify({ turn: 1, notesTurn: 4, notesUpdatedAt: 3 }));
    await writeState(dir, { turn: 2, injections: [], lastLogged: undefined });
    const saved = JSON.parse(await Bun.file(statePath(dir)).text());
    expect(saved).toEqual({ turn: 2, injections: [], notesTurn: 4, notesUpdatedAt: 3 });
  });

  test("drops the retired injected map; malformed injections are left out", async () => {
    const dir = await tempDir();
    await Bun.write(
      statePath(dir),
      JSON.stringify({ turn: 3, injected: { "lore/a": 2 }, injections: [{ ref: "lore/a" }] }),
    );
    const state = await readState(dir);
    expect(state.injections).toEqual([]);
    await writeState(dir, state);
    expect(JSON.parse(await Bun.file(statePath(dir)).text())).toEqual({
      turn: 3,
      injections: [],
    });
  });
});
