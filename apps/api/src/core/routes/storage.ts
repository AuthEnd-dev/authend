import { Hono } from "hono";
import { HttpError } from "../lib/http";
import { resolveRequestActor } from "../middleware/auth";
import {
  createFolder,
  readLocalStoredFile,
  readPublicObject,
  createSignedDownloadUrl,
  createSignedUploadUrl,
  getStorageFileRecordById,
  headStoredFile,
  listStorageFileRecords,
  removeStoredFile,
  uploadFile,
  verifyLocalSignedDownload,
} from "../services/storage-service";

function parseOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const storageRouter = new Hono()
  .get("/public/*", async (c) => {
    const raw = c.req.param("*") ?? "";
    const key = decodeURIComponent(raw.replace(/^\/+/, ""));
    if (!key) {
      throw new HttpError(400, "key is required");
    }
    const { body, mimeType } = await readPublicObject(key);
    return new Response(body, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  })
  .post("/upload", async (c) => {
  const actor = await resolveRequestActor(c);
  if (actor.kind === "public") {
    throw new HttpError(401, "Authentication required");
  }

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) {
    throw new HttpError(400, "Missing file upload field");
  }

  const visibilityInput = parseOptionalString(body.visibility);
  if (visibilityInput && visibilityInput !== "public" && visibilityInput !== "private") {
    throw new HttpError(400, "visibility must be public or private");
  }

  const uploaded = await uploadFile({
    file,
    visibility: visibilityInput as "public" | "private" | undefined,
    prefix: parseOptionalString(body.prefix),
    attachment: {
      table: parseOptionalString(body.attachmentTable),
      recordId: parseOptionalString(body.attachmentRecordId),
      field: parseOptionalString(body.attachmentField),
    },
  });

  return c.json(uploaded, 201);
})
  .post("/folders", async (c) => {
    const actor = await resolveRequestActor(c);
    if (actor.kind === "public") {
      throw new HttpError(401, "Authentication required");
    }
    const body = (await c.req.json()) as {
      path?: string;
      visibility?: "public" | "private";
    };
    if (!body.path || body.path.trim().length === 0) {
      throw new HttpError(400, "path is required");
    }
    if (body.visibility && body.visibility !== "public" && body.visibility !== "private") {
      throw new HttpError(400, "visibility must be public or private");
    }
    return c.json(
      await createFolder({
        path: body.path.trim(),
        visibility: body.visibility,
      }),
      201,
    );
  })
  .post("/signed-upload", async (c) => {
    const actor = await resolveRequestActor(c);
    if (actor.kind === "public") {
      throw new HttpError(401, "Authentication required");
    }
    const body = (await c.req.json()) as {
      key?: string;
      contentType?: string;
      visibility?: "public" | "private";
      expiresIn?: number;
    };
    if (!body.key || body.key.trim().length === 0) {
      throw new HttpError(400, "key is required");
    }
    return c.json(
      await createSignedUploadUrl({
        key: body.key.trim(),
        contentType: parseOptionalString(body.contentType),
        visibility: body.visibility,
        expiresIn: typeof body.expiresIn === "number" ? body.expiresIn : undefined,
      }),
    );
  })
  .post("/signed-download", async (c) => {
    const actor = await resolveRequestActor(c);
    if (actor.kind === "public") {
      throw new HttpError(401, "Authentication required");
    }
    const body = (await c.req.json()) as {
      key?: string;
      expiresIn?: number;
    };
    if (!body.key || body.key.trim().length === 0) {
      throw new HttpError(400, "key is required");
    }
    return c.json(
      await createSignedDownloadUrl({
        key: body.key.trim(),
        expiresIn: typeof body.expiresIn === "number" ? body.expiresIn : undefined,
      }),
    );
  })
  .get("/download", async (c) => {
    const key = parseOptionalString(c.req.query("key"));
    const expiresRaw = parseOptionalString(c.req.query("expires"));
    const signature = parseOptionalString(c.req.query("sig"));
    if (!key || !expiresRaw || !signature) {
      throw new HttpError(400, "key, expires and sig are required");
    }
    const expiresAtUnix = Number(expiresRaw);
    if (!Number.isFinite(expiresAtUnix)) {
      throw new HttpError(400, "expires must be a unix timestamp in seconds");
    }
    const valid = verifyLocalSignedDownload({
      key,
      expiresAtUnix,
      signature,
    });
    if (!valid) {
      throw new HttpError(401, "Invalid or expired signed download URL");
    }
    const file = await readLocalStoredFile(key);
    return new Response(file);
  })
  .get("/head/*", async (c) => {
    const actor = await resolveRequestActor(c);
    if (actor.kind === "public") {
      throw new HttpError(401, "Authentication required");
    }
    const key = decodeURIComponent(c.req.param("*") ?? "");
    if (!key) {
      throw new HttpError(400, "key is required");
    }
    return c.json(await headStoredFile(key));
  })
  .delete("/*", async (c) => {
    const actor = await resolveRequestActor(c);
    if (actor.kind === "public") {
      throw new HttpError(401, "Authentication required");
    }
    const key = decodeURIComponent(c.req.param("*") ?? "");
    if (!key) {
      throw new HttpError(400, "key is required");
    }
    await removeStoredFile(key);
    return c.body(null, 204);
  })
  .get("/files", async (c) => {
    const actor = await resolveRequestActor(c);
    if (actor.kind === "public") {
      throw new HttpError(401, "Authentication required");
    }
    const query = c.req.query();
    const visibilityRaw = parseOptionalString(query.visibility);
    const visibility =
      visibilityRaw === "public" || visibilityRaw === "private" ? visibilityRaw : undefined;
    return c.json(
      await listStorageFileRecords({
        table: parseOptionalString(query.table),
        recordId: parseOptionalString(query.recordId),
        field: parseOptionalString(query.field),
        search: parseOptionalString(query.search),
        prefix: parseOptionalString(query.prefix),
        visibility,
        limit: query.limit ? Number(query.limit) : undefined,
      }),
    );
  })
  .get("/files/:id", async (c) => {
    const actor = await resolveRequestActor(c);
    if (actor.kind === "public") {
      throw new HttpError(401, "Authentication required");
    }
    return c.json(await getStorageFileRecordById(c.req.param("id")));
  });
