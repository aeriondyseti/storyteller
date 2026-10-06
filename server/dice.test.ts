import { describe, expect, test } from "bun:test";
import { formatRoll, type Rng, roll } from "./dice.ts";
import { errorMessage } from "./registry.ts";

// Returns the given die faces in order, for a die of `sides` sides.
function faces(sides: number, ...values: number[]): Rng {
  let i = 0;
  return () => ((values[i++] ?? 1) - 1) / sides;
}

describe("roll", () => {
  test("NdM+K", () => {
    const r = roll("2d6+1", faces(6, 3, 5));
    expect(r.total).toBe(9);
    expect(formatRoll(r)).toBe("2d6+1: 2d6 [3, 5] + 1 = 9");
  });

  test("keep highest and lowest", () => {
    expect(roll("2d20kh1", faces(20, 4, 17)).total).toBe(17);
    expect(roll("2d20kl1", faces(20, 4, 17)).total).toBe(4);
    const r = roll("4d6kh3", faces(6, 2, 6, 1, 4));
    expect(r.total).toBe(12);
    expect(formatRoll(r)).toBe("4d6kh3: 4d6kh3 [2, 6, 1, 4] keep 6, 4, 2 = 12");
  });

  test("bare d20, subtraction, spaces", () => {
    expect(roll("d20", faces(20, 11)).total).toBe(11);
    expect(roll("1d8 - 2", faces(8, 5)).total).toBe(3);
  });

  test("results stay within the die", () => {
    for (let i = 0; i < 200; i++) {
      const t = roll("3d6").total;
      expect(t).toBeGreaterThanOrEqual(3);
      expect(t).toBeLessThanOrEqual(18);
    }
  });

  test("bad expressions get a clear message", () => {
    for (const bad of ["", "fireball", "2d", "2d6++1", "0d6", "2d1", "2d6kh3", "1000d6"]) {
      let message = "";
      try {
        roll(bad);
      } catch (error) {
        message = errorMessage(error);
      }
      expect(message).not.toBe("");
      expect(message).not.toContain("Something went wrong");
    }
  });
});
