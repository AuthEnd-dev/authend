# @authend/mcp-server

Schema-first MCP server for local AuthEnd app building.

This package exposes AuthEnd as an MCP server so local AI tools can inspect and evolve the backend through:

- schema creation and updates
- data CRUD
- plugin management
- storage CRUD
- SDK schema inspection

It is designed for local development workflows where the AI helps scaffold the app by shaping the AuthEnd backend first.

## What It Does

The MCP server wraps existing AuthEnd services. It does not create a second backend path.

The intended workflow is:

1. Read the current schema draft.
2. Create or update tables and relations.
3. Preview the draft.
4. Apply the draft.
5. Seed or update data.
6. Inspect the generated SDK schema.

## Requirements

You need the same environment AuthEnd itself needs:

- `DATABASE_URL`
- `APP_URL`
- `ADMIN_URL`
- `BETTER_AUTH_SECRET`
- `SUPERADMIN_EMAIL`
- `SUPERADMIN_PASSWORD`

If you already run AuthEnd locally, the MCP server uses that same setup.

## Start It

From the repo root:

```bash
bun install
```

### `stdio` transport

Use this for local MCP clients that spawn a process directly.

```bash
bun run mcp:stdio
```

### HTTP transport

Use this for MCP clients that talk over HTTP.

```bash
bun run mcp:http
```

Default port:

```txt
7003
```

Override it with:

```bash
AUTHEND_MCP_PORT=7010 bun run mcp:http
```

The MCP endpoint is:

```txt
http://localhost:7003/mcp
```

## Tool Categories

### Schema-first tools

- `authend_get_schema_draft`
- `authend_preview_schema`
- `authend_apply_schema`
- `authend_create_table`
- `authend_update_table`
- `authend_delete_table`
- `authend_create_relation`
- `authend_update_relation`
- `authend_delete_relation`
- `authend_set_table_api_config`
- `authend_get_schema_drift`

These are the primary tools. Use them to define the backend before creating records.

### Resource and data tools

- `authend_list_resources`
- `authend_get_resource_meta`
- `authend_list_records`
- `authend_get_record`
- `authend_create_record`
- `authend_update_record`
- `authend_delete_record`

### Plugin tools

- `authend_list_plugins`
- `authend_get_plugin_manifest`
- `authend_enable_plugin`
- `authend_disable_plugin`
- `authend_update_plugin_config`

### Storage tools

- `authend_list_storage_objects`
- `authend_get_storage_object`
- `authend_put_storage_object`
- `authend_delete_storage_object`

### SDK schema tool

- `authend_get_sdk_schema`

## Recommended Usage Pattern

For AI clients, prefer this sequence:

1. Call `authend_get_schema_draft`.
2. Use targeted schema mutation tools like `authend_create_table` or `authend_set_table_api_config`.
3. Review the returned preview payload.
4. Call `authend_apply_schema` with the returned draft when ready to commit.
5. Use data CRUD tools to seed records.
6. Call `authend_get_sdk_schema` so client code can align with the new backend shape.

## Example MCP Client Config

### Claude Desktop style `stdio`

```json
{
  "mcpServers": {
    "authend": {
      "command": "bun",
      "args": ["run", "mcp:stdio"],
      "cwd": "/absolute/path/to/authend"
    }
  }
}
```

### HTTP client

Point the MCP client at:

```txt
http://localhost:7003/mcp
```

## Notes

- The server is intended for trusted local development environments.
- Schema changes are draft-based. `authend_apply_schema` is the explicit commit point.
- Delete tools are supported and are destructive. Call them with exact identifiers only.
- V1 does not edit arbitrary app source files. It builds the AuthEnd backend that the local app uses.

## Development

Run the package tests:

```bash
bun test packages/mcp-server
```

Main entrypoints:

- [`src/stdio.ts`](/Users/akuma/Github/akumzy/authend/packages/mcp-server/src/stdio.ts)
- [`src/http.ts`](/Users/akuma/Github/akumzy/authend/packages/mcp-server/src/http.ts)
- [`src/tools.ts`](/Users/akuma/Github/akumzy/authend/packages/mcp-server/src/tools.ts)
