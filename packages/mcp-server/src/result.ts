export function summariseJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function okResult(summary: string, payload: Record<string, unknown>) {
  return {
    content: [
      {
        type: "text" as const,
        text: `${summary}\n\n${summariseJson(payload)}`,
      },
    ],
    structuredContent: payload,
  };
}

export function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${message}`,
      },
    ],
    isError: true,
  };
}
