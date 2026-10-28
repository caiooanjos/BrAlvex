// Executor de migrations versionadas. Aplica, em ordem, os arquivos migrations/NNN_nome.sql ainda não registrados.
// Nunca apaga nem reverte nada automaticamente.
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, q } from "./db.js";

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function migrate(dbConfig, { log = console.log } = {}) {
  const pool = createPool({ ...dbConfig, connectionLimit: 1 }, { multipleStatements: true });
  try {
    await q(
      pool,
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) NOT NULL PRIMARY KEY,
        applied_at DATETIME(3) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    const applied = new Set((await q(pool, "SELECT version FROM schema_migrations")).map((r) => r.version));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();
    const pending = files.filter((f) => !applied.has(f));
    for (const file of pending) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      // DDL no MySQL não é transacional: a migration só é registrada depois de executada por completo.
      await pool.query(sql);
      await q(pool, "INSERT INTO schema_migrations (version, applied_at) VALUES (?, UTC_TIMESTAMP(3))", [file]);
      log(`migration aplicada: ${file}`);
    }
    if (!pending.length) log("Nenhuma migration pendente.");
    return pending;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // As migrations podem usar um usuário com privilégios de DDL (DB_MIGRATION_USER), separado do usuário da aplicação.
  const env = process.env;
  const db = {
    host: env.DB_HOST || "127.0.0.1",
    port: Number(env.DB_PORT || 3306),
    user: env.DB_MIGRATION_USER || env.DB_USER,
    password: env.DB_MIGRATION_PASSWORD || env.DB_PASSWORD,
    database: env.DB_NAME,
  };
  if (!db.user || !db.database) {
    console.error("Defina DB_NAME e DB_MIGRATION_USER/DB_USER (e as senhas correspondentes).");
    process.exit(1);
  }
  migrate(db).catch((err) => {
    console.error(`Falha na migration: ${err.code || ""} ${err.message}`);
    process.exit(1);
  });
}
