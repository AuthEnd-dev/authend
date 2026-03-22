import { resolve } from "node:path";
import { writeTextFile } from "../lib/fs";
import { buildOpenApiSpec } from "../services/openapi-service";

const outputFile = resolve(import.meta.dir, "../../../packages/sdk/openapi.json");

await writeTextFile(outputFile, JSON.stringify(await buildOpenApiSpec(), null, 2));
