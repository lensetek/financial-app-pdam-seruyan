// Services: CRUD mcp_tokens. Dipakai admin routes + MCP tools.
const { generateToken, sanitizeRoles } = require('../mcp/auth');

async function listTokens(db) {
  return db.queryAll(
    `SELECT id, name, token_prefix, roles, created_by, created_at, last_used_at,
            expires_at, revoked_at, revoked_by, notes, token_hash IS NOT NULL AS has_token
     FROM mcp_tokens ORDER BY id DESC`
  );
}

// Buat token baru. Return { id, plaintext sekali }. Plaintext tidak disimpan.
async function createToken(db, { name, roles, expires_in_days, notes, actor }) {
  const { plaintext, hash, tokenPrefix } = generateToken(name);
  const cleanRoles = sanitizeRoles(roles);
  const expiresAt = expires_in_days && expires_in_days > 0
    ? new Date(Date.now() + expires_in_days * 86400000)
    : null;
  const result = await db.queryRun(
    `INSERT INTO mcp_tokens (name, token_hash, token_prefix, roles, created_by, expires_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [name || 'unnamed', hash, tokenPrefix, cleanRoles, actor || 'unknown', expiresAt, '']
  );
  const id = result.rows[0].id;
  await db.queryRun(
    `INSERT INTO mcp_token_audit (token_id, event, detail) VALUES (?, 'created', ?)`,
    [id, JSON.stringify({ roles: cleanRoles, created_by: actor || 'unknown' })]
  );
  return { id, name: name || 'unnamed', roles: cleanRoles, token_prefix: tokenPrefix, plaintext_token: plaintext, expires_at: expiresAt };
}

async function revokeToken(db, id, actor) {
  const result = await db.queryRun(
    `UPDATE mcp_tokens SET revoked_at = CURRENT_TIMESTAMP, revoked_by = ? WHERE id = ? AND revoked_at IS NULL`,
    [actor || 'unknown', id]
  );
  const changed = result && result.rowCount > 0;
  if (changed) {
    await db.queryRun(`INSERT INTO mcp_token_audit (token_id, event, detail) VALUES (?, 'revoked', ?)`, [id, actor || 'unknown']);
  }
  return { revoked: changed };
}

async function extendToken(db, id, days) {
  if (!days || days <= 0) return { error: 'days harus > 0' };
  const result = await db.queryRun(
    `UPDATE mcp_tokens SET expires_at = COALESCE(expires_at, CURRENT_TIMESTAMP) + (? * INTERVAL '1 day') WHERE id = ? AND revoked_at IS NULL`,
    [days, id]
  );
  return result.rowCount > 0
    ? { extended: true }
    : { extended: false, error: 'Token tidak ditemukan atau sudah revoked' };
}

async function deleteToken(db, id) {
  await db.queryRun(`INSERT INTO mcp_token_audit (token_id, event) VALUES (?, 'deleted')`, [id]);
  await db.queryRun('DELETE FROM mcp_tokens WHERE id = ?', [id]);
  return { deleted: true };
}

module.exports = { listTokens, createToken, revokeToken, extendToken, deleteToken };