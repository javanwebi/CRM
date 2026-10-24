import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "../apps/api/src/app";
import {
  database,
  type Database,
  type Executor,
} from "../apps/api/src/database";
const pg = new PGlite();
await pg.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
await pg.exec(
  readFileSync(
    new URL("../packages/database/foundation.sql", import.meta.url),
    "utf8",
  ),
);
for (const file of [
  "backend-permissions.sql",
  "hardening.sql",
  "writer-audit.sql",
  "operations.sql",
])
  await pg.exec(
    readFileSync(
      new URL("../packages/database/" + file, import.meta.url),
      "utf8",
    ),
  );
const wrap = (client: Pick<PGlite, "query">): Executor => ({
  query: async <T>(sql: string, values: unknown[] = []) =>
    (await client.query<T>(sql, values)).rows,
});
const db: Database = process.env.E2E_DATABASE_URL
  ? database()
  : { ...wrap(pg), transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))) };
const server = createApp(db, {
  origin: "http://localhost:3100",
  webPath: resolve("apps/web/dist"),
}).listen(3100, "0.0.0.0");
process.on("SIGTERM", () =>
  server.close(() => {
    void pg.close();
  }),
);
