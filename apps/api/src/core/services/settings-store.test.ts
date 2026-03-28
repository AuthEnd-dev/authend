import { describe, expect, test } from "bun:test";

async function loadSettingsStore(appUrl: string, adminUrl?: string) {
  process.env.APP_URL = appUrl;
  if (adminUrl) {
    process.env.ADMIN_URL = adminUrl;
  } else {
    delete process.env.ADMIN_URL;
  }
  process.env.ADMIN_DEV_URL = "http://localhost:7001";
  process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/authend";
  process.env.BETTER_AUTH_SECRET ??= "test-secret-value-with-24-chars";
  process.env.SUPERADMIN_EMAIL ??= "admin@example.com";
  process.env.SUPERADMIN_PASSWORD ??= "password123";

  return import(`./settings-store?test=${encodeURIComponent(appUrl)}-${encodeURIComponent(adminUrl ?? "none")}`);
}

describe("settings store defaults", () => {
  test("general defaults use env app and admin URLs instead of shared placeholders", async () => {
    const module = await loadSettingsStore("http://localhost:7012", "http://localhost:7011");
    const general = module.defaultSettingsForSection("general");

    expect(general.appUrl).toBe("http://localhost:7012");
    expect(general.adminUrl).toBe("http://localhost:7011");
  });
});
