import { describe, expect, test } from "bun:test";
import { paginate } from "./pagination.ts";

describe("paginate", () => {
  test("returns the first page by default", () => {
    const result = paginate([1, 2, 3, 4, 5], undefined, undefined, 2);
    expect(result.items).toEqual([1, 2]);
    expect(result.info.page).toBe(1);
    expect(result.info.totalPages).toBe(3);
  });

  test("returns the requested page when valid", () => {
    const result = paginate([1, 2, 3, 4, 5], "2", "2");
    expect(result.items).toEqual([3, 4]);
    expect(result.info.page).toBe(2);
  });

  test("clamps page to the last available page", () => {
    const result = paginate([1, 2, 3], "99", "2");
    expect(result.items).toEqual([3]);
    expect(result.info.page).toBe(2);
  });
});
