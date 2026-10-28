// Aplica a política de retenção (LEAD_RETENTION_DAYS). Por padrão apenas simula; use --apply para excluir.
//   npm run retention -- [--apply]
import { createPool, q } from "../db.js";
import { loadConfig } from "../config.js";

const config = loadConfig();
if (!config.retentionDays || config.retentionDays < 1) {
  console.error("LEAD_RETENTION_DAYS não está definido. Defina o prazo de retenção aprovado pela BrAlveX antes de usar este comando.");
  process.exit(2);
}
const apply = process.argv.includes("--apply");
const pool = createPool({ ...config.db, connectionLimit: 1 });
try {
  const cutoff = "UTC_TIMESTAMP(3) - INTERVAL ? DAY";
  const [{ total }] = await q(pool, `SELECT COUNT(*) AS total FROM leads WHERE created_at < ${cutoff}`, [config.retentionDays]);
  if (!apply) {
    console.log(`${total} solicitação(ões) com mais de ${config.retentionDays} dias seriam excluídas. Rode com --apply para excluir.`);
  } else {
    const result = await q(pool, `DELETE FROM leads WHERE created_at < ${cutoff}`, [config.retentionDays]);
    await q(pool, "INSERT INTO admin_audit_log (admin_id, action, meta, created_at) VALUES (NULL, 'retention_purge', ?, UTC_TIMESTAMP(3))", [
      `rows=${result.affectedRows};days=${config.retentionDays}`,
    ]);
    console.log(`${result.affectedRows} solicitação(ões) excluída(s).`);
  }
} finally {
  await pool.end();
}
