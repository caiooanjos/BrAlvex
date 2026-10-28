// Armazenamento de sessões do express-session no MySQL.
import { createHash } from "node:crypto";
import session from "express-session";
import { q } from "./db.js";

const hash = (sid) => createHash("sha256").update(sid).digest("hex");

export class MySqlSessionStore extends session.Store {
  constructor(pool, { ttlMs }) {
    super();
    this.pool = pool;
    this.ttlMs = ttlMs;
  }

  expiresFor(sess) {
    const cookieExpiry = sess?.cookie?.expires ? new Date(sess.cookie.expires) : null;
    return cookieExpiry && !Number.isNaN(cookieExpiry.getTime()) ? cookieExpiry : new Date(Date.now() + this.ttlMs);
  }

  get(sid, cb) {
    q(this.pool, "SELECT data FROM admin_sessions WHERE sid_hash = ? AND expires_at > UTC_TIMESTAMP(3)", [hash(sid)])
      .then((rows) => cb(null, rows.length ? JSON.parse(rows[0].data) : null))
      .catch(cb);
  }

  set(sid, sess, cb = () => {}) {
    q(
      this.pool,
      `INSERT INTO admin_sessions (sid_hash, admin_id, data, expires_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE admin_id = VALUES(admin_id), data = VALUES(data), expires_at = VALUES(expires_at)`,
      [hash(sid), sess.adminId ?? null, JSON.stringify(sess), this.expiresFor(sess)],
    )
      .then(() => cb(null))
      .catch(cb);
  }

  touch(sid, sess, cb = () => {}) {
    q(this.pool, "UPDATE admin_sessions SET expires_at = ? WHERE sid_hash = ?", [this.expiresFor(sess), hash(sid)])
      .then(() => cb(null))
      .catch(cb);
  }

  destroy(sid, cb = () => {}) {
    q(this.pool, "DELETE FROM admin_sessions WHERE sid_hash = ?", [hash(sid)])
      .then(() => cb(null))
      .catch(cb);
  }

  async prune() {
    await q(this.pool, "DELETE FROM admin_sessions WHERE expires_at <= UTC_TIMESTAMP(3)");
  }
}
