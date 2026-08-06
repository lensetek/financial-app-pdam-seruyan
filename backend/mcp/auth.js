// Token util untuk MCP: generate, hash, verify, query DB.
const crypto = require('crypto');

const VALID_ROLES = ['viewer', 'operator', 'admin'];

// Generate plaintext token (hanya satu kali muncul) + hash untuk DB.
function generateToken(name = '') {
  // prefix identitas token (6 char) + 40 char random base64url
  const plaintext = `pdam_${crypto.randomBytes(24).toString('base64url')}`;
  const hash = hashToken(plaintext);
  const tokenPrefix = plaintext.slice(0, 12);
  return { plaintext, hash, tokenPrefix };
}

function hashToken(plaintext) {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

function sanitizeRoles(roles) {
  if (!Array.isArray(roles)) roles = ['viewer'];
  const set = new Set(roles.filter(r => VALID_ROLES.includes(r)));
  if (set.size === 0) set.add('viewer');
  return [...set];
}

function extractBearer(req) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// Verify token terhadap DB. Return row atau null.
async function verifyToken(db, plaintext) {
  const hash = hashToken(plaintext);
  const row = await db.queryOne(
    `SELECT id, name, roles, created_by, expires_at, revoked_at, notes
     FROM mcp_tokens
     WHERE token_hash = ? AND revoked_at IS NULL`,
    [hash]
  );
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    // expired
    db.queryRun(`INSERT INTO mcp_token_audit (token_id, event, detail) VALUES (?, 'expired', '')`, [row.id]).catch(() => {});
    return null;
  }
  // update last_used_at (fire-and-forget)
  db.queryRun('UPDATE mcp_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]).catch(() => {});
  return row;
}

module.exports = { generateToken, hashToken, sanitizeRoles, extractBearer, verifyToken, VALID_ROLES };