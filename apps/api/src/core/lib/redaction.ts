export const REDACTED_VALUE = "[REDACTED]";

const SENSITIVE_KEY_PATTERN = /(password|secret|token|authorization|cookie|api[_-]?key|access[_-]?key|private[_-]?key|signature|sig$|smtp(pass|password))/i;
const SENSITIVE_QUERY_KEY_PATTERN = /^(sig|signature|token|password|secret|api[_-]?key|key)$/i;
const URL_PATH_SECRET_HINT_PATTERN = /(reset|verify|magic|token|password)/i;

function maskString(value: string) {
  return value.length === 0 ? value : REDACTED_VALUE;
}

function redactUrlLikeString(value: string) {
  if (!value.includes("://")) {
    return value;
  }

  try {
    const url = new URL(value);
    for (const [key] of url.searchParams.entries()) {
      if (SENSITIVE_QUERY_KEY_PATTERN.test(key)) {
        url.searchParams.set(key, REDACTED_VALUE);
      }
    }

    const segments = url.pathname.split("/");
    const lastIndex = segments.length - 1;
    if (lastIndex > 1 && URL_PATH_SECRET_HINT_PATTERN.test(segments[lastIndex - 1] ?? "")) {
      segments[lastIndex] = REDACTED_VALUE;
      url.pathname = segments.join("/");
    }

    return url.toString();
  } catch {
    return value;
  }
}

function redactQueryString(value: string) {
  const params = new URLSearchParams(value);
  for (const [key] of params.entries()) {
    if (SENSITIVE_QUERY_KEY_PATTERN.test(key)) {
      params.set(key, REDACTED_VALUE);
    }
  }
  return params.toString();
}

export function redactSensitiveData(value: unknown, key?: string): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    if (key === "preview" && process.env.NODE_ENV === "test") {
      return value;
    }
    if (key === "query") {
      return redactQueryString(value);
    }
    if (key && SENSITIVE_KEY_PATTERN.test(key)) {
      return maskString(value);
    }
    return redactUrlLikeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveData(entry));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        redactSensitiveData(entryValue, entryKey),
      ]),
    );
  }

  return value;
}
