import { describe, expect, test } from "bun:test";
import { createSanitizeError } from "../src/server/sanitize-error.ts";

describe("createSanitizeError", () => {
  test("redacts every configured secret value from the message", () => {
    const sanitize = createSanitizeError(["super-secret-token", "me@example.com"]);
    const message = sanitize(new Error("Jira search failed (401): token super-secret-token sent by me@example.com"));
    expect(message).not.toContain("super-secret-token");
    expect(message).not.toContain("me@example.com");
    expect(message).toContain("[redacted]");
  });

  test("redacts a Basic auth header even when the literal secrets don't appear verbatim", () => {
    const sanitize = createSanitizeError([]);
    const message = sanitize(new Error("request failed, sent Authorization: Basic ZW1haWw6dG9rZW4="));
    expect(message).not.toContain("ZW1haWw6dG9rZW4=");
    expect(message).toContain("Basic [redacted]");
  });

  test("redacts a Bearer token", () => {
    const sanitize = createSanitizeError([]);
    const message = sanitize(new Error("failed: Bearer abc123.def456-ghi"));
    expect(message).not.toContain("abc123.def456-ghi");
    expect(message).toContain("Bearer [redacted]");
  });

  test("passes through a message with no secrets unchanged", () => {
    const sanitize = createSanitizeError(["token", "email@example.com"]);
    expect(sanitize(new Error("network timeout"))).toBe("network timeout");
  });

  test("handles a non-Error thrown value", () => {
    const sanitize = createSanitizeError(["secret"]);
    expect(sanitize("plain string with secret in it")).toBe("plain string with [redacted] in it");
  });

  test("truncates a very long message", () => {
    const sanitize = createSanitizeError([]);
    const long = "x".repeat(1000);
    expect(sanitize(new Error(long)).length).toBe(500);
  });
});
