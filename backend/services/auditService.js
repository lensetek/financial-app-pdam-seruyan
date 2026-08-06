// Services: audit logs. Dipakai routes + MCP.
async function listAuditLogs(db, limit = 200) {
  return db.queryAll(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ${parseInt(limit) || 200}`);
}

async function listLoginSessions(db, limit = 50) {
  return db.queryAll(`SELECT * FROM login_sessions ORDER BY login_at DESC LIMIT ${parseInt(limit) || 50}`);
}

module.exports = { listAuditLogs, listLoginSessions };