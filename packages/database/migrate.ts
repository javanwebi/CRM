import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
const pool = new Pool({connectionString:process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL});
const client=await pool.connect();
try {await client.query('BEGIN');await client.query('CREATE SCHEMA IF NOT EXISTS private; CREATE TABLE IF NOT EXISTS private.schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())'); const done=await client.query("SELECT 1 FROM private.schema_migrations WHERE name='crm_foundation'"); if(!done.rowCount){await client.query(readFileSync(new URL('./foundation.sql',import.meta.url),'utf8'));await client.query("INSERT INTO private.schema_migrations(name) VALUES('crm_foundation')");}await client.query('COMMIT');} catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();await pool.end();}
