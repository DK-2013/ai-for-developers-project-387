import { describe, expect, it } from "vitest";
import { isDatabaseUnavailable } from "../src/db/availability.js";

function errorWithCode(code: string): Error {
  return Object.assign(new Error(`failed with ${code}`), { code });
}

describe("isDatabaseUnavailable", () => {
  it("recognizes a connection refusal nested in a cause chain", () => {
    const error = new Error("Prepare database", { cause: errorWithCode("ECONNREFUSED") });

    expect(isDatabaseUnavailable(error)).toBe(true);
  });

  it("recognizes PostgreSQL connection-exception SQLSTATEs", () => {
    expect(isDatabaseUnavailable(errorWithCode("08006"))).toBe(true);
    expect(isDatabaseUnavailable(errorWithCode("57P03"))).toBe(true);
  });

  it("does not treat a broken migration as unavailable", () => {
    const error = new Error("Prepare database", { cause: errorWithCode("42P01") });

    expect(isDatabaseUnavailable(error)).toBe(false);
  });

  it("does not treat a missing database or bad credentials as unavailable", () => {
    expect(isDatabaseUnavailable(errorWithCode("3D000"))).toBe(false);
    expect(isDatabaseUnavailable(errorWithCode("28P01"))).toBe(false);
  });

  it("handles non-Error values", () => {
    expect(isDatabaseUnavailable("connect ECONNREFUSED")).toBe(false);
    expect(isDatabaseUnavailable(undefined)).toBe(false);
  });
});
