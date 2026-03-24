import type { AuthendIncludeDefinition, AuthendSchemaResource, ListResponse } from "./client";
import { createAuthendClient, defineAuthendSchema } from "./client";
import type { DataRecord } from "./types";

type Equal<Left, Right> = (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

type AuthorRecord = {
  id: string;
  name: string;
};

type PostRecord = {
  id: string;
  title: string;
  author_id: string;
};

type Schema = {
  resources: {
    posts: AuthendSchemaResource<
      PostRecord,
      { title: string; author_id: string },
      { title?: string },
      "id" | "title",
      "title",
      {
        author: AuthendIncludeDefinition<AuthorRecord, "author">;
      },
      {
        list: true;
        get: true;
        create: true;
        update: true;
        delete: false;
      }
    >;
    readOnlyAuthors: AuthendSchemaResource<
      AuthorRecord,
      never,
      never,
      "id" | "name",
      "name",
      {},
      {
        list: true;
        get: true;
        create: false;
        update: false;
        delete: false;
      }
    >;
  };
};

const schema = defineAuthendSchema<Schema>({
  resources: {
    posts: {
      routeSegment: "posts",
      operations: {
        list: true,
        get: true,
        create: true,
        update: true,
        delete: false,
      },
    },
    readOnlyAuthors: {
      routeSegment: "authors",
      operations: {
        list: true,
        get: true,
        create: false,
        update: false,
        delete: false,
      },
    },
  },
});

const client = createAuthendClient<Schema>({
  baseURL: "http://localhost:7002",
  schema,
  fetch,
});

type PostListPromise = ReturnType<typeof client.data.posts.list<{ include: "author"; sort: "title"; filterField: "title" }>>;
type PostListItem = Awaited<PostListPromise>["items"][number];
type _postInclude = Assert<Equal<PostListItem, PostRecord & { author: AuthorRecord | null }>>;

type ReadOnlyCreate = typeof client.data.readOnlyAuthors.create;
type _readOnlyCreateDisabled = Assert<Equal<ReadOnlyCreate, never>>;

type PostGet = Awaited<ReturnType<typeof client.data.posts.get>>;
type _postGet = Assert<Equal<PostGet, PostRecord>>;

type PostList = Awaited<ReturnType<typeof client.data.posts.list>>;
declare const postListResult: PostList;
const _postListAssignable: ListResponse<PostRecord> = postListResult;

const dynamicResourceClient = client.data.resource("posts");
type DynamicPostGet = Awaited<ReturnType<typeof dynamicResourceClient.get>>;
type _dynamicPathFallsBackToDataRecord = Assert<Equal<DynamicPostGet, DataRecord>>;
