import { readFileSync } from "node:fs";
import { Pool } from "pg";
const pool = new Pool({
  connectionString:
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(734208)");
  await client.query(
    "CREATE SCHEMA IF NOT EXISTS private; CREATE TABLE IF NOT EXISTS private.schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
  );
  for (const [name, file] of [
    ["crm_foundation", "foundation.sql"],
    ["backend_login_permissions", "backend-permissions.sql"],
  ]) {
    const done = await client.query(
      "SELECT 1 FROM private.schema_migrations WHERE name=$1",
      [name],
    );
    if (!done.rowCount) {
      await client.query(
        readFileSync(new URL("./" + file, import.meta.url), "utf8"),
      );
      await client.query(
        "INSERT INTO private.schema_migrations(name) VALUES($1)",
        [name],
      );
    }
  }
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
