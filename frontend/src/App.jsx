import React, { useState, useEffect, useRef } from 'react'
import Dashboard from './components/Dashboard'
import TransaksiPage from './components/TransaksiPage'
import LabaRugi from './components/LabaRugi'
import Neraca from './components/Neraca'
import ProcessPage from './components/ProcessPage'
import AuditTrailPage from './components/AuditTrailPage'
import McpTokensPage from './components/McpTokensPage'
import FirebasePage from './components/FirebasePage'
import Login from './components/Login'
import { getTransaksi } from './api'
import { supabase } from './supabaseClient'
import './style.css'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏛️' },
  { id: 'transaksi', label: 'Transaksi', icon: '💳' },
  { id: 'laba-rugi', label: 'Laba Rugi', icon: '📈' },
  { id: 'neraca', label: 'Neraca', icon: '⚖️' },
  { id: 'process', label: 'Proses', icon: '⚡' },
  { id: 'audit-trail', label: 'Riwayat Audit', icon: '🔒' },
  { id: 'mcp-tokens', label: 'Token MCP', icon: '🔑' },
]

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState('')
  
  // Auth states
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Search feature states
  const [globalSearch, setGlobalSearch] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [transaksiData, setTransaksiData] = useState([])
  const [transaksiSearchParam, setTransaksiSearchParam] = useState('')
  const searchInputRef = useRef(null)

  // Notification states
  const [notifications, setNotifications] = useState([])
  const [showNotifDropdown, setShowNotifDropdown] = useState(false)
  const notifRef = useRef(null)

  const unreadCount = notifications.filter(n => n.unread).length

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }))
    }
    updateTime()
    const timer = setInterval(updateTime, 60000)
    return () => clearInterval(timer)
  }, [])

  // Listen to Auth State
  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleUserSession(session?.user || null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleUserSession(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleUserSession = async (currentUser) => {
    setUser(currentUser);
    if (currentUser) {
      // Try to fetch user profile from Supabase
      try {
        const { data: profile, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', currentUser.id)
          .single();

        if (profile) {
          setUserProfile(profile);
        } else {
          // Profile belum ada, buat otomatis
          const defaultProfile = {
            id: currentUser.id,
            nama: currentUser.id === 'p7hWsFiwZ3fSy2Zq3lFhVv3EqsS2' ? 'tes akuntan' : (currentUser.email?.split('@')[0] || 'User'),
            role: 'Akuntan'
          };
          
          try {
            const { error: insertError } = await supabase
              .from('users')
              .insert([defaultProfile]);
              
            if (insertError) throw insertError;
            setUserProfile(defaultProfile);
          } catch (err) {
            console.error("Gagal membuat profil default (kemungkinan Supabase RLS):", err);
            setUserProfile(defaultProfile); // Tetap tampilkan di UI meskipun gagal simpan
          }
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    } else {
      setUserProfile(null);
    }
    setAuthLoading(false);
  };

  // Prefetch transactions for fast searching
  useEffect(() => {
    getTransaksi().then(setTransaksiData).catch(() => {})
  }, [])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchInputRef.current && !searchInputRef.current.contains(e.target)) {
        setShowSearchDropdown(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredMenus = navItems.filter(item => 
    item.label.toLowerCase().includes(globalSearch.toLowerCase())
  )

  const filteredTransaksi = Array.isArray(transaksiData) ? transaksiData.filter(t => 
    String(t.deskripsi || '').toLowerCase().includes(String(globalSearch || '').toLowerCase()) ||
    String(t.nominal || '').includes(globalSearch || '') ||
    (Array.isArray(t.jurnal) && t.jurnal.some(j => String(j.akun_nama || '').toLowerCase().includes(String(globalSearch || '').toLowerCase())))
  ).slice(0, 5) : []

  const handleSearchSelect = (targetPage, searchParam = '') => {
    setPage(targetPage)
    setTransaksiSearchParam(searchParam)
    setGlobalSearch('')
    setShowSearchDropdown(false)
  }

  const markNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })))
  }

  const toggleNotif = () => {
    if (!showNotifDropdown && unreadCount > 0) {
      markNotificationsAsRead()
    }
    setShowNotifDropdown(!showNotifDropdown)
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  }

  if (authLoading) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>Loading...</div>
  }

  if (!user) {
    return <Login />
  }

  const displayName = userProfile?.nama || user?.email?.split('@')[0] || 'User';

  return (
    <div className="app-layout">
      {/* Sidebar Overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Desktop Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">💧</div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">PDAM Seruyan</span>
            <span className="sidebar-brand-sub">Sistem Keuangan Digital</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-title">Menu</div>
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-btn${page === item.id ? ' active' : ''}`}
              onClick={() => { setPage(item.id); setSidebarOpen(false) }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}

          <div className="sidebar-section-title" style={{ marginTop: '0.75rem' }}>Lainnya</div>
          <a href="/research" target="_blank" rel="noopener noreferrer" className="nav-btn">
            <span className="nav-icon">🔍</span>
            <span className="nav-label">Research Engine</span>
          </a>
          <button className="nav-btn" onClick={handleLogout} style={{ color: 'var(--danger)', marginTop: 'auto' }}>
            <span className="nav-icon">🚪</span>
            <span className="nav-label">Keluar (Logout)</span>
          </button>
        </nav>
      </aside>

      <div className="main-area">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-brand">
            <div className="topbar-logo">💧</div>
            <div className="topbar-title">
              <span className="topbar-name">PDAM Seruyan</span>
              <span className="topbar-subtitle">Sistem Keuangan Digital</span>
            </div>
          </div>
          
          <div className="topbar-search-container" ref={searchInputRef}>
            <div className="topbar-search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input 
                type="text" 
                placeholder="Cari transaksi, menu, laporan..." 
                value={globalSearch}
                onChange={e => {
                  setGlobalSearch(e.target.value)
                  setShowSearchDropdown(true)
                }}
                onFocus={() => setShowSearchDropdown(true)}
              />
            </div>
            
            {showSearchDropdown && globalSearch && (
              <div className="search-dropdown">
                {filteredMenus.length > 0 && (
                  <div className="search-dropdown-section">Menu</div>
                )}
                {filteredMenus.map(menu => (
                  <div 
                    key={menu.id} 
                    className="search-dropdown-item"
                    onClick={() => handleSearchSelect(menu.id)}
                  >
                    <span className="icon">{menu.icon}</span>
                    <span>{menu.label}</span>
                  </div>
                ))}

                {filteredTransaksi.length > 0 && (
                  <div className="search-dropdown-section" style={{ marginTop: filteredMenus.length ? '0.5rem' : 0 }}>
                    Transaksi
                  </div>
                )}
                {filteredTransaksi.map(t => (
                  <div 
                    key={t.id} 
                    className="search-dropdown-item"
                    onClick={() => handleSearchSelect('transaksi', globalSearch)}
                  >
                    <span className="icon">📄</span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{t.deskripsi}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {t.tanggal} • Rp {new Intl.NumberFormat('id-ID').format(t.nominal)}
                      </span>
                    </div>
                  </div>
                ))}

                {filteredMenus.length === 0 && filteredTransaksi.length === 0 && (
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    Tidak ada hasil untuk "{globalSearch}"
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="topbar-right">
            <span className="topbar-clock">{currentTime}</span>
            <span className="topbar-status">Online</span>
            
            <div className="notif-container" ref={notifRef}>
              <button 
                className="notif-btn" 
                title="Notifikasi"
                onClick={toggleNotif}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
              </button>

              {showNotifDropdown && (
                <div className="notif-dropdown">
                  <div className="notif-dropdown-header">Notifikasi</div>
                  <div className="notif-dropdown-list">
                    {notifications.map(n => (
                      <div key={n.id} className={`notif-item ${n.unread ? 'unread' : ''}`}>
                        <div className="notif-text">{n.text}</div>
                        <div className="notif-time">{n.time}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '0.5rem', paddingLeft: '1rem', borderLeft: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)' }}>{displayName}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{userProfile?.role || 'Akuntan'}</span>
              </div>
              <button 
                onClick={handleLogout}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.35rem 0.5rem',
                  cursor: 'pointer',
                  color: 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.75rem'
                }}
                title="Keluar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                Keluar
              </button>
            </div>

            <button className="toggle-btn hide-mobile" onClick={() => setSidebarOpen(!sidebarOpen)} title="Menu">
              ☰
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="main-content">
          {page === 'dashboard' && <Dashboard setPage={setPage} />}
          {page === 'transaksi' && <TransaksiPage initialSearch={transaksiSearchParam} key={transaksiSearchParam} />}
          {page === 'laba-rugi' && <LabaRugi />}
          { page === 'neraca' && <Neraca /> }
          { page === 'process' && <ProcessPage /> }
          { page === 'audit-trail' && <AuditTrailPage /> }
          { page === 'mcp-tokens' && <McpTokensPage /> }
          { page === 'firebase' && <FirebasePage /> }
        </main>
      </div>

      {/* Bottom Navigation - Mobile */}
      <nav className="bottom-nav">
        <ul className="bottom-nav-list">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`bottom-nav-item${page === item.id ? ' active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span className="bottom-nav-icon">{item.icon}</span>
              <span className="bottom-nav-label">{item.label}</span>
            </button>
          ))}
        </ul>
      </nav>
    </div>
  )
}