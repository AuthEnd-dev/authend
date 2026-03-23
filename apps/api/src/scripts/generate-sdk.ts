import { resolve } from "node:path";
import { sql } from "../db/client";
import { writeTextFile } from "../lib/fs";
import { buildOpenApiSpec } from "../services/openapi-service";

const outputFile = resolve(import.meta.dir, "../../../../packages/sdk/openapi.json");

try {
  await writeTextFile(outputFile, JSON.stringify(await buildOpenApiSpec(), null, 2));
} finally {
  await sql.end();
}
