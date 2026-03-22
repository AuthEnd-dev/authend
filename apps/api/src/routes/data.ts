import { Hono } from "hono";
import { requireSuperAdmin } from "../middleware/auth";
import {
  createRecord,
  deleteRecord,
  getRecord,
  getTableDescriptor,
  listRecords,
  listBrowsableTables,
  updateRecord,
} from "../services/crud-service";

export const dataRouter = new Hono()
  .use("*", requireSuperAdmin)
  .get("/", async (c) => c.json({ tables: await listBrowsableTables() }))
  .get("/meta/:table", async (c) => c.json(await getTableDescriptor(c.req.param("table"))))
  .get("/:table", async (c) => {
    const table = c.req.param("table");
    return c.json(await listRecords(table, new URL(c.req.url).searchParams));
  })
  .post("/:table", async (c) => {
    const table = c.req.param("table");
    return c.json(await createRecord(table, await c.req.json()));
  })
  .get("/:table/:id", async (c) => c.json(await getRecord(c.req.param("table"), c.req.param("id"))))
  .patch("/:table/:id", async (c) =>
    c.json(await updateRecord(c.req.param("table"), c.req.param("id"), await c.req.json())),
  )
  .delete("/:table/:id", async (c) => {
    await deleteRecord(c.req.param("table"), c.req.param("id"));
    return c.body(null, 204);
  });
