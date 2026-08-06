import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function McpTokensPage() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newToken, setNewToken] = useState(null);
  const [form, setForm] = useState({ name: '', roles: ['viewer'], expires_in_days: 90 });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const supaToken = session?.access_token;
    // Utamakan ADMIN_TOKEN env (bootstrap tanpa akun Supabase); fallback ke JWT supabase.
    const envToken = import.meta.env.VITE_ADMIN_TOKEN;
    if (envToken) {
      return { 'Content-Type': 'application/json', 'X-Admin-Token': envToken };
    }
    if (supaToken) {
      return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + supaToken };
    }
    throw new Error('Not logged in. Set VITE_ADMIN_TOKEN di .env untuk bootstrap.');
  };

  // Parse JSON response dengan aman (backend bisa balik HTML error 401/403).
  const safeJson = async (res) => {
    try { return await res.json(); } catch { return { error: 'Server error (' + res.status + ')' }; }
  };

  const fetchTokens = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/mcp-tokens', { headers: await authHeaders() });
      const data = await safeJson(res);
      if (!res.ok) throw new Error('Terjadi masalah auth: ' + (data.error || data.message || res.status));
      setTokens(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTokens(); }, []);

  const toggleRole = (r) => {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(r) ? f.roles.filter(x => x !== r) : [...f.roles, r]
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/admin/mcp-tokens', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ ...form, roles: form.roles.length ? form.roles : ['viewer'] })
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || data.message || 'Gagal membuat token');
      setNewToken(data);
      setShowCreate(false);
      await fetchTokens();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!confirm('Revoke token ini? Aksi tidak dapat dibatalkan.')) return;
    try {
      await fetch(`/api/admin/mcp-tokens/${id}/revoke`, { method: 'POST', headers: await authHeaders() });
      fetchTokens();
    } catch (err) {
      alert('Gagal revoke: ' + err.message);
    }
  };

  const handleExtend = async (id) => {
    const days = parseInt(prompt('Tambahkan berapa hari?', '90'));
    if (!days || days <= 0) return;
    try {
      await fetch(`/api/admin/mcp-tokens/${id}/extend`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ days }) });
      fetchTokens();
    } catch (err) {
      alert('Gagal extend: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Hard delete token ini? History akan hilang.')) return;
    try {
      await fetch(`/api/admin/mcp-tokens/${id}`, { method: 'DELETE', headers: await authHeaders() });
      fetchTokens();
    } catch (err) {
      alert('Gagal hapus: ' + err.message);
    }
  };

  const copyPlaintext = () => {
    if (!newToken?.plaintext_token) return;
    navigator.clipboard.writeText(newToken.plaintext_token);
    alert('Token disalin ke clipboard. Hanya tampil sekali!');
  };

  const fmtDate = (v) => v ? new Date(v).toLocaleString('id-ID') : '—';
  const roleBadge = (roles) => (roles || []).map(r =>
    <span key={r} style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, backgroundColor: r === 'admin' ? '#fde8e8' : (r === 'operator' ? '#fdf6b2' : '#def7ec'), color: r === 'admin' ? '#9b1c1c' : (r === 'operator' ? '#723b13' : '#03543f'), marginRight: 4 }}>{r}</span>
  );

  return (
    <div className="page-container" style={{ padding: '1.5rem', backgroundColor: '#f9fafb', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>🔑 Token MCP</h1>
          <p style={{ color: '#6b7280', margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>Kelola token akses MCP. Beri URL + token ke client (Claude Desktop, Cursor) sesuai role.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => { setShowCreate(true); setNewToken(null); setFormError(null); setForm({ name: '', roles: ['viewer'], expires_in_days: 90 }); }} className="btn btn-primary">
            + Buat Token
          </button>
          <button onClick={fetchTokens} className="btn" style={{ border: '1px solid #d1d5db', background: 'white', borderRadius: '6px', padding: '0.5rem 1rem', cursor: 'pointer' }}>🔄 Segarkan</button>
        </div>
      </div>

      {error && <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</div>}

      {/* Endpoint & cara pakai */}
      <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1rem 1.5rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#111827' }}>🔗 Endpoint &amp; Cara Pakai</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', color: '#374151' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ width: '70px', color: '#6b7280' }}>URL MCP:</span>
            <code style={{ background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '0.375rem', userSelect: 'all' }}>{window.location.origin}/mcp</code>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ width: '70px', color: '#6b7280' }}>Client:</span>
            <code style={{ background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '0.375rem', userSelect: 'all', whiteSpace: 'pre-wrap' }}>{`"mcpServers": { "pdam": { "url": "${window.location.origin}/mcp", "headers": { "Authorization": "Bearer &lt;TOKEN&gt;" } } }`}</code>
          </div>
          <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
            Tempel JSON di <code>~/.config/Claude/claude_desktop_config.json</code> (atau Cursor). Ganti <code>&lt;TOKEN&gt;</code> dengan token yang kamu buat.
          </div>
        </div>
      </div>

      {showCreate && (
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem' }}>Buat Token Baru</h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Nama</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="mis: Claude Desktop - Akuntan" style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }} required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Roles</label>
              {['viewer', 'operator', 'admin'].map(r => (
                <label key={r} style={{ marginRight: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <input type="checkbox" checked={form.roles.includes(r)} onChange={() => toggleRole(r)} />
                  {r}
                </label>
              ))}
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Expired (hari)</label>
              <input type="number" min="1" value={form.expires_in_days} onChange={e => setForm({ ...form, expires_in_days: parseInt(e.target.value) || 90 })} style={{ width: '120px', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }} />
            </div>
            {formError && <div style={{ color: '#b91c1c', fontSize: '0.875rem' }}>{formError}</div>}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={saving} className="btn btn-primary">{saving ? 'Menyimpan...' : 'Buat'}</button>
              <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', backgroundColor: 'white', cursor: 'pointer' }}>Batal</button>
            </div>
          </form>
        </div>
      )}

      {newToken && (
        <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1.5rem' }}>
          <h4 style={{ margin: '0 0 0.5rem', color: '#065f46' }}>✅ Token Dibuat — Salin SEKARANG</h4>
          <p style={{ margin: '0 0 0.5rem', color: '#065f46' }}>Token ini hanya ditampilkan sekali.</p>
          <code style={{ display: 'block', background: '#064e3b', color: '#a7f3d0', padding: '0.75rem', borderRadius: '0.375rem', fontFamily: 'monospace', wordBreak: 'break-all', userSelect: 'all' }}>{newToken.plaintext_token}</code>
          <button onClick={copyPlaintext} style={{ marginTop: '0.5rem', padding: '0.4rem 0.75rem', backgroundColor: '#065f46', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}>📋 Salin</button>
        </div>
      )}

      <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Memuat token...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead style={{ backgroundColor: '#f3f4f6', color: '#4b5563', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 600 }}>
                <tr>
                  <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>Nama</th>
                  <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>Roles</th>
                  <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>Prefix</th>
                  <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>Dibuat</th>
                  <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>Terakhir dipakai</th>
                  <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>Expired</th>
                  <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>Aksi</th>
                </tr>
              </thead>
              <tbody style={{ color: '#1f2937' }}>
                {tokens.length === 0 ? (
                  <tr><td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Belum ada token.</td></tr>
                ) : tokens.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '1rem' }}><strong>{t.name}</strong></td>
                    <td style={{ padding: '1rem' }}>{roleBadge(t.roles)}</td>
                    <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{t.token_prefix}...</td>
                    <td style={{ padding: '1rem', fontSize: '0.75rem' }}>{fmtDate(t.created_at)}</td>
                    <td style={{ padding: '1rem', fontSize: '0.75rem' }}>{fmtDate(t.last_used_at)}</td>
                    <td style={{ padding: '1rem', fontSize: '0.75rem' }}>{fmtDate(t.expires_at)}</td>
                    <td style={{ padding: '1rem' }}>
                      {t.revoked_at
                        ? <span style={{ color: '#9b1c1c', fontWeight: 600 }}>Revoked</span>
                        : (t.expires_at && new Date(t.expires_at) < new Date())
                          ? <span style={{ color: '#723b13', fontWeight: 600 }}>Expired</span>
                          : <span style={{ color: '#03543f', fontWeight: 600 }}>Aktif</span>}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {!t.revoked_at && <>
                        <button onClick={() => handleExtend(t.id)} style={{ marginRight: '0.25rem', padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', backgroundColor: 'white', cursor: 'pointer' }}>Extend</button>
                        <button onClick={() => handleRevoke(t.id)} style={{ marginRight: '0.25rem', padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', backgroundColor: '#fef2f2', cursor: 'pointer' }}>Revoke</button>
                      </>}
                      <button onClick={() => handleDelete(t.id)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: '1px solid #ef4444', borderRadius: '0.25rem', backgroundColor: 'white', cursor: 'pointer', color: '#b91c1c' }}>Hapus</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}