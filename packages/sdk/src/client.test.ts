import { describe, expect, test } from 'bun:test';
import { AuthendApiError, createAuthendClient } from './client';

function asFetch(fn: (...args: Parameters<typeof fetch>) => Promise<Response>): typeof fetch {
  return fn as unknown as typeof fetch;
}

function requireHeaders(value: Headers | null): Headers {
  if (!value) {
    throw new Error('Expected fetch headers to be captured.');
  }
  return value;
}

describe('Authend SDK API errors', () => {
  test('throws structured AuthendApiError for JSON error payloads', async () => {
    const mockFetch = asFetch(
      async () =>
        new Response(
          JSON.stringify({
            error: 'Validation failed.',
            code: 'VALIDATION_FAILED',
            details: { field: 'title' },
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );

    const client = createAuthendClient({
      baseURL: 'http://localhost:7002',
      fetch: mockFetch,
    });

    await expect(client.data.create('posts', { title: '' })).rejects.toMatchObject({
      name: 'AuthendApiError',
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed.',
      path: '/api/data/posts',
      details: { field: 'title' },
    });
  });

  test('falls back to plain response text when payload is not JSON', async () => {
    const mockFetch = asFetch(
      async () =>
        new Response('Service temporarily unavailable', {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        }),
    );

    const client = createAuthendClient({
      baseURL: 'http://localhost:7002',
      fetch: mockFetch,
    });

    let thrown: unknown;
    try {
      await client.data.tables();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AuthendApiError);
    const apiError = thrown as AuthendApiError;
    expect(apiError.status).toBe(503);
    expect(apiError.message).toBe('Service temporarily unavailable');
    expect(apiError.path).toBe('/api/data');
    expect(apiError.code).toBeUndefined();
    expect(apiError.rawBody).toBe('Service temporarily unavailable');
  });
});

describe('Authend SDK API-key ergonomics', () => {
  test('automatically sends x-api-key when configured', async () => {
    let capturedHeaders: Headers | null = null;
    const mockFetch = asFetch(async (_input, init) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ tables: ['posts'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = createAuthendClient({
      baseURL: 'http://localhost:7002',
      fetch: mockFetch,
      apiKey: 'ak_test_123',
    });

    await client.data.tables();
    const headers = requireHeaders(capturedHeaders);
    expect(headers.get('x-api-key')).toBe('ak_test_123');
  });

  test('supports apiKey providers and custom header names', async () => {
    let capturedHeaders: Headers | null = null;
    const mockFetch = asFetch(async (_input, init) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(
        JSON.stringify({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });

    const client = createAuthendClient({
      baseURL: 'http://localhost:7002',
      fetch: mockFetch,
      apiKey: () => 'ak_provider_default',
      apiKeyHeaderName: 'authorization',
    });

    await client.data.list(
      'posts',
      new URLSearchParams({
        include: 'author',
      }),
    );
    let headers = requireHeaders(capturedHeaders);
    expect(headers.get('authorization')).toBe('ak_provider_default');

    await client.data.create('posts', { title: 'hello' });
    headers = requireHeaders(capturedHeaders);
    expect(headers.get('authorization')).toBe('ak_provider_default');
  });
});

describe('Authend SDK list helpers', () => {
  test('page and withInclude compose list params', async () => {
    const requestedUrls: string[] = [];
    const mockFetch = asFetch(async (input) => {
      requestedUrls.push(String(input));
      return new Response(
        JSON.stringify({
          items: [],
          total: 0,
          page: 2,
          pageSize: 10,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });

    const client = createAuthendClient({
      baseURL: 'http://localhost:7002',
      fetch: mockFetch,
    });

    await client.data.resource('posts').page(2, { pageSize: 10, sort: 'created_at' });
    await client.data.resource('posts').withInclude(['author', 'comments'], { pageSize: 5 });

    expect(requestedUrls[0]).toContain('/api/data/posts?page=2&pageSize=10&sort=created_at');
    expect(requestedUrls[1]).toContain('/api/data/posts?pageSize=5&include=author%2Ccomments');
  });

  test('iteratePages and iterateItems walk paginated responses', async () => {
    const responses = [
      {
        items: [{ id: '1' }, { id: '2' }],
        total: 3,
        page: 1,
        pageSize: 2,
      },
      {
        items: [{ id: '3' }],
        total: 3,
        page: 2,
        pageSize: 2,
      },
    ];
    let callCount = 0;
    const mockFetch = asFetch(async () => {
      const payload = responses[Math.min(callCount, responses.length - 1)];
      callCount += 1;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = createAuthendClient({
      baseURL: 'http://localhost:7002',
      fetch: mockFetch,
    });

    const pages: Array<{ page: number; itemCount: number }> = [];
    for await (const page of client.data.resource<{ id: string }>('posts').iteratePages({ pageSize: 2 })) {
      pages.push({ page: page.page, itemCount: page.items.length });
    }
    expect(pages).toEqual([
      { page: 1, itemCount: 2 },
      { page: 2, itemCount: 1 },
    ]);

    callCount = 0;
    const ids: string[] = [];
    for await (const item of client.data.resource<{ id: string }>('posts').iterateItems({ pageSize: 2 })) {
      ids.push(item.id);
    }
    expect(ids).toEqual(['1', '2', '3']);
  });
});
