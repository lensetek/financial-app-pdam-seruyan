// Hybrid admin auth: env ADMIN_TOKEN (bootstrap/emergency) + Supabase JWT per-user.
const crypto = require('crypto');

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  try { return crypto.timingSafeEqual(bufA, bufB); } catch (e) { return false; }
}

module.exports = function adminAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  let token = match ? match[1].trim() : null;

  // Dukung X-Admin-Token (env bootstrap) supaya UI bisa akses tanpa akun Supabase
  if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // 1. Env ADMIN_TOKEN (bootstrap/emergency)
  const envToken = process.env.ADMIN_TOKEN;
  if (envToken && timingSafeEqualStr(token, envToken)) {
    req.admin = { source: 'env_token', id: 'env', email: 'env-admin' };
    return next();
  }

  // 2. Supabase JWT per-user: verifikasi + cek app_metadata.role === 'admin'
  try {
    const { supabase } = require('../supabase-client');
    supabase.auth.getUser(token)
      .then(({ data, error }) => {
        if (error || !data.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const meta = data.user.app_metadata || {};
        if (meta.role !== 'admin' && meta.app_role !== 'admin') {
          return res.status(403).json({ error: 'Forbidden: butuh role admin' });
        }
        req.admin = { source: 'supabase', id: data.user.id, email: data.user.email, role: meta.role || meta.app_role };
        next();
      })
      .catch(() => res.status(401).json({ error: 'Unauthorized' }));
  } catch (e) {
    return res.status(500).json({ error: 'Admin auth tidak tersedia: ' + e.message });
  }
};