import { describe, expect, test } from "bun:test";
import { resolveAdminAuthBaseUrl } from "./auth-url";

describe("resolveAdminAuthBaseUrl", () => {
  test("preserves an origin-only admin URL", () => {
    expect(resolveAdminAuthBaseUrl("http://localhost:7001")).toBe("http://localhost:7001");
  });

  test("strips the admin shell path before auth routes are appended", () => {
    expect(resolveAdminAuthBaseUrl("http://localhost:7001/admin")).toBe("http://localhost:7001");
    expect(resolveAdminAuthBaseUrl("https://admin.example.com/admin/")).toBe("https://admin.example.com");
  });

  test("drops search params and hashes from the admin URL", () => {
    expect(resolveAdminAuthBaseUrl("https://admin.example.com/admin?tab=auth#login")).toBe("https://admin.example.com");
  });
});
