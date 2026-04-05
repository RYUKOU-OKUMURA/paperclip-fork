// @vitest-environment node

import "../i18n";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/client";
import { formatErrorForUser } from "./formatErrorForUser";

describe("formatErrorForUser", () => {
  it("maps ApiError by HTTP status to Japanese", () => {
    expect(formatErrorForUser(new ApiError("x", 404, {}))).toContain("見つかりません");
  });

  it("passes through generic Error message when not a known pattern", () => {
    expect(formatErrorForUser(new Error("custom"))).toBe("custom");
  });
});
