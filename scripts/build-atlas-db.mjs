// scripts/build-atlas-db.mjs
// Creates (or resets) db/atlas.db from db/schema.sql + db/seed/*.sql.
//
// db/atlas.db is the live, committed datastore for the Atlas — edit it
// directly with the sqlite3 CLI (or any SQLite GUI) as real locations,
// catches, and observations come in. This script is for a fresh clone, or
// a deliberate full reset back to the seed data — it DROPS every table
// first, so it will discard any hand-entered rows. It will refuse to run
// without --force if db/atlas.db already exists, as a guardrail against
// wiping real data by accident.
//
// Usage:
//   node scripts/build-atlas-db.mjs           # only if db/atlas.db doesn't exist yet
//   node scripts/build-atlas-db.mjs --force    # rebuild from scratch, discarding current data

import { DatabaseSync } from "node:sqlite";
import { readFile } from "fs/promises";
import { existsSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { join } from "path";

const DB_PATH = fileURLToPath(new URL("../db/atlas.db", import.meta.url));
const SCHEMA_PATH = fileURLToPath(new URL("../db/schema.sql", import.meta.url));
const SEED_DIR = fileURLToPath(new URL("../db/seed/", import.meta.url));
const SEED_FILES = ["layers.sql", "habitats.sql", "species.sql", "jolly_bay_locations.sql"];

const force = process.argv.includes("--force");

if (existsSync(DB_PATH) && !force) {
  console.error(`db/atlas.db already exists. Re-run with --force to drop and rebuild it from db/schema.sql + db/seed/*.sql (this discards any hand-entered rows).`);
  process.exit(1);
}

if (existsSync(DB_PATH)) unlinkSync(DB_PATH);

const db = new DatabaseSync(DB_PATH);
db.exec(await readFile(SCHEMA_PATH, "utf8"));
for (const file of SEED_FILES) {
  db.exec(await readFile(join(SEED_DIR, file), "utf8"));
}
db.close();

console.log(`Built db/atlas.db from schema.sql + ${SEED_FILES.length} seed file(s).`);
