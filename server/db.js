import mysql from "mysql2/promise";

const QUERY_TIMEOUT_MS = 8000;

export function createPool(db, { multipleStatements = false } = {}) {
  const pool = mysql.createPool({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    connectionLimit: db.connectionLimit ?? 5,
    waitForConnections: true,
    queueLimit: 50,
    connectTimeout: 8000,
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
    dateStrings: false,
    multipleStatements,
  });
  // Todas as datas são gravadas e lidas em UTC.
  pool.pool.on("connection", (conn) => conn.query("SET time_zone = '+00:00'"));
  return pool;
}

/** Consulta parametrizada com tempo limite. Nunca concatene valores no SQL. */
export async function q(pool, sql, params = []) {
  const [rows] = await pool.query({ sql, timeout: QUERY_TIMEOUT_MS }, params);
  return rows;
}
