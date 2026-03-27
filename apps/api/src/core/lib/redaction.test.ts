import { describe, expect, test } from "bun:test";
import { REDACTED_VALUE, redactSensitiveData } from "./redaction";

describe("redactSensitiveData", () => {
  test("redacts sensitive object keys recursively", () => {
    expect(
      redactSensitiveData({
        password: "secret-password",
        nested: {
          authorization: "Bearer abc123",
          token: "tok_123",
        },
      }),
    ).toEqual({
      password: REDACTED_VALUE,
      nested: {
        authorization: REDACTED_VALUE,
        token: REDACTED_VALUE,
      },
    });
  });

  test("redacts sensitive query parameters", () => {
    expect(redactSensitiveData("key=abc&sig=def&page=1", "query")).toBe(`key=${encodeURIComponent(REDACTED_VALUE)}&sig=${encodeURIComponent(REDACTED_VALUE)}&page=1`);
  });

  test("redacts secret-bearing URLs", () => {
    expect(redactSensitiveData("https://example.com/reset-password/abc123?token=xyz")).toBe(
      `https://example.com/reset-password/${REDACTED_VALUE}?token=${encodeURIComponent(REDACTED_VALUE)}`,
    );
  });
});
