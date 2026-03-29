export function resolveAdminAuthBaseUrl(adminUrl: string): string {
  const normalized = new URL(adminUrl);
  normalized.pathname = "";
  normalized.search = "";
  normalized.hash = "";
  return normalized.toString().replace(/\/$/, "");
}
