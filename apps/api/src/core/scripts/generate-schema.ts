import { writeTextFile } from "../lib/fs";
import { resolveGeneratedSchemaFile } from "../lib/generated-artifacts";
import { getSchemaDraft, schemaServiceTestUtils } from "../services/schema-service";

if (process.argv.includes("--help")) {
  console.log("Usage: bun src/core/scripts/generate-schema.ts");
  console.log("Regenerates the generated Drizzle schema module from the saved schema draft and extension schema.");
  process.exit(0);
}

try {
  const draft = await getSchemaDraft();
  const schemaText = schemaServiceTestUtils.renderSchemaModule(draft);
  const outputPath = resolveGeneratedSchemaFile();

  await writeTextFile(outputPath, schemaText);

  console.log(
    JSON.stringify({
      action: "schema.generated",
      path: outputPath,
      tableCount: draft.tables.length,
      relationCount: draft.relations.length,
    }),
  );
} finally {
  try {
    const { sql } = await import("../db/client");
    await sql.end({ timeout: 0 });
  } catch {
    // Ignore shutdown failures when generation exits early.
  }
}
