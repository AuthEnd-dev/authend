export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json(
      {
        error: error.message,
        details: error.details ?? null,
      },
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : "Unknown error";

  return Response.json(
    {
      error: message,
    },
    { status: 500 },
  );
}
