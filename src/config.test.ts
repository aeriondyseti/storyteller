import { describe, expect, test } from "bun:test";
import { defaultConfig, loadConfig, withDefaults } from "./config.ts";

describe("withDefaults", () => {
  test("empty input yields the defaults", () => {
    expect(withDefaults({})).toEqual(defaultConfig);
  });

  test("valid values are kept, invalid ones fall back", () => {
    const config = withDefaults({
      notesEvery: 3,
      notesModel: "sonnet",
      narratorEffort: "silly",
      embeddings: "hosted",
      paneOnStart: "yes",
      contextBudget: "a lot",
    });
    expect(config.notesEvery).toBe(3);
    expect(config.notesModel).toBe("sonnet");
    expect(config.narratorEffort).toBe("high");
    expect(config.embeddings).toBe("hosted");
    expect(config.paneOnStart).toBe(true);
    expect(config.contextBudget).toBe(0.25);
  });

  test("loreBudget is a share from 0 to 1; loreScanDepth whole and not negative", () => {
    expect(withDefaults({ loreBudget: 0.2, loreScanDepth: 5 })).toMatchObject({
      loreBudget: 0.2,
      loreScanDepth: 5,
    });
    expect(withDefaults({ loreBudget: 3, loreScanDepth: -1 })).toMatchObject({
      loreBudget: 1,
      loreScanDepth: 0,
    });
    expect(withDefaults({ loreBudget: "lots", loreScanDepth: 2.9 })).toMatchObject({
      loreBudget: 0.1,
      loreScanDepth: 2,
    });
  });

  test("notesEvery is at least one and whole", () => {
    expect(withDefaults({ notesEvery: 0 }).notesEvery).toBe(1);
    expect(withDefaults({ notesEvery: 2.7 }).notesEvery).toBe(2);
  });
});

describe("loadConfig", () => {
  test("RP_CONFIG wins over settings", async () => {
    const config = await loadConfig({ RP_CONFIG: JSON.stringify({ notesEvery: 5 }) });
    expect(config.notesEvery).toBe(5);
  });

  test("malformed RP_CONFIG falls back to defaults", async () => {
    expect(await loadConfig({ RP_CONFIG: "{not json" })).toEqual(defaultConfig);
  });
});
