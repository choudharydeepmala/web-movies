/**
 * ███╗   ██╗███████╗██╗  ██╗ ██████╗ ██████╗  █████╗
 * ████╗  ██║██╔════╝╚██╗██╔╝██╔═══██╗██╔══██╗██╔══██╗
 * ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║██████╔╝███████║
 * ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║██╔══██╗██╔══██║
 * ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝██║  ██║██║  ██║
 * ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
 *
 * Web Cinema — Your Cinematic Universe
 * Capstone Project: Web Cinema — OTT Entertainment Streaming Platform
 * Domain: Entertainment & Media
 * API: TMDB (The Movie Database) — https://www.themoviedb.org/
 *
 * ⚠️  SETUP: Copy .env.example → .env and set VITE_NEXORA_TMDB_API_KEY (free TMDB key):
 *     https://www.themoviedb.org/settings/api
 *
 * Stack: React (Vite) · Context API · React Router · Axios · CSS-in-JS
 * Features: Search+Filter+Sort · Debounce · Pagination · Dark/Light Mode ·
 *           Continue Watching · Watchlist · Error Boundary · Memoization ·
 *           Lazy Loading · Real-time Refresh · Role-Based Mock Auth
 */

import {
  useState, useEffect, useCallback, useContext, createContext,
  useRef, useMemo, Suspense, Component, memo,
} from 'react';
import {
  BrowserRouter, Routes, Route, useNavigate, useParams,
  Link, useLocation, Navigate,
} from 'react-router-dom';
import { TMDB_API_KEY, TMDB_KEY_URL, tmdbHttp, formatTmdbAxiosError } from './webCinemaApi.js';

// ─────────────────────────────────────────────────────────────────────────────
// 🔑  TMDB images (paths from API responses)
// ─────────────────────────────────────────────────────────────────────────────
const IMG_ORIG     = 'https://image.tmdb.org/t/p/original';
const IMG_W500     = 'https://image.tmdb.org/t/p/w500';
const IMG_W300     = 'https://image.tmdb.org/t/p/w300';

// ─────────────────────────────────────────────────────────────────────────────
// 🔐  KRMU institutional auth (local accounts; ID must contain “.krmu”)
// ─────────────────────────────────────────────────────────────────────────────
const KRMU_ACCOUNTS_KEY = 'nexora_krmu_accounts';
const KRMU_SESSION_KEY = 'nexora_krmu_session';

const isKrmuInstitutionalId = (raw) => String(raw || '').trim().toLowerCase().includes('.krmu');

/** Legacy storage (v1); still verified on login and upgraded to v2. */
const hashKrmuPasswordLegacy = (emailNorm, password) => {
  const e = String(emailNorm).trim().toLowerCase();
  try {
    return btoa(unescape(encodeURIComponent(`${e}\0${password}\0nexora-krmu-v1`)));
  } catch {
    return '';
  }
};

/** Web Crypto SHA-256 for new signups and upgraded accounts. */
const hashKrmuPasswordSecure = async (emailNorm, password) => {
  const e = String(emailNorm).trim().toLowerCase();
  const enc = new TextEncoder();
  const data = enc.encode(`${e}|${password}|nexora-krmu-sha256-v2`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
};

const readKrmuAccounts = () => {
  try {
    const j = localStorage.getItem(KRMU_ACCOUNTS_KEY);
    const a = j ? JSON.parse(j) : [];
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
};

const writeKrmuAccounts = (accounts) => {
  localStorage.setItem(KRMU_ACCOUNTS_KEY, JSON.stringify(accounts));
};

const MOVIE_GENRES = {
  28:'Action', 12:'Adventure', 16:'Animation', 35:'Comedy', 80:'Crime',
  99:'Documentary', 18:'Drama', 10751:'Family', 14:'Fantasy', 36:'History',
  27:'Horror', 10402:'Music', 9648:'Mystery', 10749:'Romance',
  878:'Sci-Fi', 53:'Thriller', 10752:'War', 37:'Western',
};

// ─────────────────────────────────────────────────────────────────────────────
// 🎨  THEME SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg:        '#07080f',
    bgCard:    '#0e1120',
    bgOverlay: '#131729',
    bgNav:     'rgba(7,8,15,0.92)',
    text:      '#e8edf8',
    textMuted: '#7a85a3',
    textDim:   '#4a5168',
    accent:    '#f0b429',
    accentHov: '#ffc94a',
    danger:    '#e8445a',
    border:    'rgba(255,255,255,0.07)',
    shadow:    '0 8px 40px rgba(0,0,0,0.6)',
  },
  light: {
    bg:        '#f4f5fa',
    bgCard:    '#ffffff',
    bgOverlay: '#eef0f8',
    bgNav:     'rgba(244,245,250,0.92)',
    text:      '#111827',
    textMuted: '#5a6480',
    textDim:   '#9aa0b8',
    accent:    '#c9920e',
    accentHov: '#e6a810',
    danger:    '#d63551',
    border:    'rgba(0,0,0,0.08)',
    shadow:    '0 4px 24px rgba(0,0,0,0.12)',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 💉  GLOBAL STYLES — injected once into <head>
// ─────────────────────────────────────────────────────────────────────────────
const GlobalStyles = () => {
  useEffect(() => {
    const id = 'webcinema-global';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=DM+Sans:wght@300;400;500;600&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html { scroll-behavior: smooth; }
      body { font-family: 'DM Sans', sans-serif; overflow-x: hidden; transition: background 0.3s; }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #f0b42966; border-radius: 99px; }
      ::-webkit-scrollbar-thumb:hover { background: #f0b429; }
      .webcinema-row-scroll { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 12px; scroll-behavior: smooth; }
      .webcinema-row-scroll::-webkit-scrollbar { height: 3px; }
      .webcinema-row-scroll::-webkit-scrollbar-thumb { background: #f0b42944; }
      .card-hover { transition: transform 0.22s ease, box-shadow 0.22s ease; cursor: pointer; }
      .card-hover:hover { transform: scale(1.04) translateY(-4px); }
      @keyframes shimmer {
        0%   { background-position: -600px 0; }
        100% { background-position:  600px 0; }
      }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes heroFade { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: translateX(0); } }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      .animate-in { animation: fadeIn 0.5s ease forwards; }
      .hero-text { animation: heroFade 0.7s ease forwards; }
      .spin { animation: spin 0.9s linear infinite; }
      .pulse { animation: pulse 1.5s ease infinite; }
      .skeleton { background: linear-gradient(90deg,#1a1f35 25%,#252b47 50%,#1a1f35 75%);
        background-size: 600px 100%; animation: shimmer 1.4s infinite; border-radius: 8px; }
      button { cursor: pointer; font-family: inherit; }
      a { text-decoration: none; }
      .badge { display:inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; letter-spacing:0.04em; text-transform:uppercase; }
      .tag { padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
    `;
    document.head.appendChild(el);
  }, []);
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 🗃️  CONTEXT — Global App State
// ─────────────────────────────────────────────────────────────────────────────
const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

const AppProvider = ({ children }) => {
  const [darkMode,          setDarkMode]          = useState(true);
  const [user,              setUser]              = useState(() => {
    try {
      const s = localStorage.getItem(KRMU_SESSION_KEY);
      if (!s) return null;
      const u = JSON.parse(s);
      if (u && typeof u === 'object' && u.email && isKrmuInstitutionalId(u.email)) return u;
      localStorage.removeItem(KRMU_SESSION_KEY);
      return null;
    } catch {
      return null;
    }
  });
  const [watchlist,         setWatchlist]         = useState(() => JSON.parse(localStorage.getItem('nexora_watchlist') || '[]'));
  const [continueWatching,  setContinueWatching]  = useState(() => JSON.parse(localStorage.getItem('nexora_continue') || '[]'));
  const [searchQuery,       setSearchQuery]       = useState('');
  const [activeGenre,       setActiveGenre]       = useState(null);
  const [notification,      setNotification]      = useState(null);

  const theme = darkMode ? THEMES.dark : THEMES.light;

  // Persist watchlist + KRMU session
  useEffect(() => { localStorage.setItem('nexora_watchlist', JSON.stringify(watchlist)); }, [watchlist]);
  useEffect(() => { localStorage.setItem('nexora_continue', JSON.stringify(continueWatching)); }, [continueWatching]);
  useEffect(() => {
    if (user?.email) localStorage.setItem(KRMU_SESSION_KEY, JSON.stringify(user));
    else localStorage.removeItem(KRMU_SESSION_KEY);
  }, [user]);

  // Global body bg
  useEffect(() => { document.body.style.background = theme.bg; document.body.style.color = theme.text; }, [theme]);

  const notify = useCallback((msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const toggleWatchlist = useCallback((item) => {
    setWatchlist(prev => {
      const exists = prev.some(m => m.id === item.id);
      if (exists) { notify('Removed from Watchlist', 'warning'); return prev.filter(m => m.id !== item.id); }
      notify('Added to Watchlist ✓', 'success');
      return [item, ...prev];
    });
  }, [notify]);

  const addContinueWatching = useCallback((item, progress = 0) => {
    setContinueWatching(prev => {
      const filtered = prev.filter(m => m.id !== item.id);
      return [{ ...item, progress, watchedAt: Date.now() }, ...filtered].slice(0, 20);
    });
  }, []);

  const removeContinue = useCallback((id) => {
    setContinueWatching(prev => prev.filter(m => m.id !== id));
  }, []);

  const isInWatchlist  = useCallback((id) => watchlist.some(m => m.id === id), [watchlist]);
  const isInContinue   = useCallback((id) => continueWatching.find(m => m.id === id), [continueWatching]);

  const signUp = useCallback(async (email, password, displayName) => {
    const emRaw = String(email).trim();
    const em = emRaw.toLowerCase();
    if (!isKrmuInstitutionalId(emRaw)) {
      notify('Your ID must include .krmu (e.g. 21cs001.krmu@college.edu).', 'warning');
      return false;
    }
    if (password.length < 6) {
      notify('Password must be at least 6 characters.', 'warning');
      return false;
    }
    const accounts = readKrmuAccounts();
    if (accounts.some((a) => a.email === em)) {
      notify('This ID is already registered. Sign in instead.', 'warning');
      return false;
    }
    const name = String(displayName || '').trim() || emRaw.split('@')[0] || 'Viewer';
    let passwordHash;
    try {
      passwordHash = await hashKrmuPasswordSecure(em, password);
    } catch {
      notify('Password hashing failed. Use https or localhost, or try another browser.', 'warning');
      return false;
    }
    accounts.push({
      email: em,
      passwordHash,
      hashVersion: 2,
      name,
      role: 'user',
    });
    writeKrmuAccounts(accounts);
    setUser({ email: emRaw, name, role: 'user', avatar: '🎬' });
    notify(`Welcome to Web Cinema, ${name}!`, 'success');
    return true;
  }, [notify]);

  const login = useCallback(async (email, password) => {
    const emRaw = String(email).trim();
    const em = emRaw.toLowerCase();
    if (!isKrmuInstitutionalId(emRaw)) {
      notify('Sign in with an institutional ID that includes .krmu.', 'warning');
      return false;
    }
    const accounts = readKrmuAccounts();
    const acc = accounts.find((a) => a.email === em);
    if (!acc) {
      notify('Wrong ID or password.', 'warning');
      return false;
    }
    let secure;
    try {
      secure = await hashKrmuPasswordSecure(em, password);
    } catch {
      notify('Sign-in failed on this device. Try localhost or https.', 'warning');
      return false;
    }
    if (acc.passwordHash === secure) {
      setUser({
        email: emRaw,
        name: acc.name,
        role: acc.role || 'user',
        avatar: acc.role === 'admin' ? '👑' : '🎬',
      });
      notify(`Welcome back, ${acc.name}!`, 'success');
      return true;
    }
    if (acc.passwordHash === hashKrmuPasswordLegacy(em, password)) {
      acc.passwordHash = secure;
      acc.hashVersion = 2;
      writeKrmuAccounts(accounts);
      setUser({
        email: emRaw,
        name: acc.name,
        role: acc.role || 'user',
        avatar: acc.role === 'admin' ? '👑' : '🎬',
      });
      notify(`Welcome back, ${acc.name}!`, 'success');
      return true;
    }
    notify('Wrong ID or password.', 'warning');
    return false;
  }, [notify]);

  const logout = useCallback(() => { setUser(null); notify('Signed out', 'info'); }, [notify]);

  const value = useMemo(() => ({
    darkMode, setDarkMode, theme, user, signUp, login, logout,
    watchlist, toggleWatchlist, isInWatchlist,
    continueWatching, addContinueWatching, removeContinue, isInContinue,
    searchQuery, setSearchQuery,
    activeGenre, setActiveGenre,
    notification, notify,
  }), [darkMode, theme, user, watchlist, continueWatching, searchQuery, activeGenre, notification,
       toggleWatchlist, isInWatchlist, addContinueWatching, removeContinue, isInContinue, signUp, login, logout, notify]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// ─────────────────────────────────────────────────────────────────────────────
// 🔌  API HOOK — TMDB fetching with loading/error states
// ─────────────────────────────────────────────────────────────────────────────
const useTMDB = (endpoint, params = {}) => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const paramsSerialized = JSON.stringify(params);

  const fetch = useCallback(async () => {
    if (!endpoint) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }
    if (!TMDB_API_KEY) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }
    setLoading(true); setError(null);
    try {
      const res = await tmdbHttp.get(endpoint, {
        params: { api_key: TMDB_API_KEY, ...JSON.parse(paramsSerialized) },
      });
      setData(res.data);
    } catch (e) {
      setError(formatTmdbAxiosError(e));
    } finally {
      setLoading(false);
    }
  }, [endpoint, paramsSerialized]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { data, loading, error, refetch: fetch };
};

// Debounce hook
const useDebounce = (value, delay = 500) => {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
};

// ─────────────────────────────────────────────────────────────────────────────
// 🛡️  ERROR BOUNDARY
// ─────────────────────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        minHeight:'60vh', gap:16, color:'#e8edf8', padding:32, textAlign:'center' }}>
        <div style={{ fontSize:64 }}>⚠️</div>
        <h2 style={{ fontFamily:'Cinzel', fontSize:24 }}>Something went wrong</h2>
        <p style={{ color:'#7a85a3', maxWidth:400 }}>{this.state.error?.message}</p>
        <button onClick={() => this.setState({ hasError:false, error:null })}
          style={{ padding:'10px 24px', borderRadius:8, border:'none', background:'#f0b429',
            color:'#07080f', fontWeight:600, cursor:'pointer' }}>
          Try Again
        </button>
      </div>
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧱  PRIMITIVE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// Spinner
const Spinner = ({ size = 32 }) => (
  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', padding:40 }}>
    <div className="spin" style={{ width:size, height:size, borderRadius:'50%',
      border:`3px solid #f0b42933`, borderTopColor:'#f0b429' }} />
  </div>
);

// Skeleton Card
const SkeletonCard = () => (
  <div style={{ minWidth:160, borderRadius:12, overflow:'hidden' }}>
    <div className="skeleton" style={{ height:240 }} />
    <div className="skeleton" style={{ height:14, marginTop:8, width:'70%' }} />
    <div className="skeleton" style={{ height:12, marginTop:6, width:'40%' }} />
  </div>
);

// Toast Notification
const Toast = memo(() => {
  const { notification, theme } = useApp();
  if (!notification) return null;
  const colors = { success:'#22c55e', warning:'#f0b429', info:'#60a5fa', error:'#e8445a' };
  return (
    <div className="animate-in" style={{ position:'fixed', bottom:24, right:24, zIndex:9999,
      background: theme.bgCard, border:`1px solid ${colors[notification.type] || theme.border}`,
      borderLeft: `4px solid ${colors[notification.type] || theme.accent}`,
      padding:'12px 20px', borderRadius:10, color:theme.text, boxShadow:theme.shadow,
      fontWeight:500, fontSize:14, maxWidth:320 }}>
      {notification.msg}
    </div>
  );
});

// Star Rating Display
const Stars = ({ vote }) => {
  const stars = Math.round((vote / 10) * 5);
  return (
    <span style={{ color:'#f0b429', fontSize:12, letterSpacing:1 }}>
      {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
      <span style={{ color:'#7a85a3', marginLeft:4 }}>{vote?.toFixed(1)}</span>
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 🃏  MOVIE CARD
// ─────────────────────────────────────────────────────────────────────────────
const MovieCard = memo(({ item, size = 'md', onPlay }) => {
  const { theme, toggleWatchlist, isInWatchlist, addContinueWatching } = useApp();
  const navigate  = useNavigate();
  const [hovered, setHovered] = useState(false);
  const [imgErr,  setImgErr]  = useState(false);

  const title     = item.title || item.name || 'Untitled';
  const year      = (item.release_date || item.first_air_date || '').substring(0, 4);
  const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
  const poster    = item.poster_path && !imgErr ? `${IMG_W300}${item.poster_path}` : null;
  const inWL      = isInWatchlist(item.id);
  const widths    = { sm: 130, md: 160, lg: 200 };
  const w         = widths[size] || 160;

  const handlePlay = (e) => {
    e.stopPropagation();
    addContinueWatching(item, Math.floor(Math.random() * 70) + 5);
    navigate(`/watch/${mediaType}/${item.id}`);
    if (onPlay) onPlay(item);
  };

  return (
    <div className="card-hover" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onClick={handlePlay}
      style={{ minWidth:w, maxWidth:w, borderRadius:12, overflow:'hidden', position:'relative',
        background: theme.bgCard, boxShadow: hovered ? theme.shadow : 'none',
        border: `1px solid ${hovered ? theme.accent + '44' : theme.border}` }}>

      {/* Poster */}
      <div style={{ height: w * 1.5, overflow:'hidden', position:'relative', background:'#0d1526' }}>
        {poster
          ? <img src={poster} alt={title} onError={() => setImgErr(true)} loading="lazy"
              style={{ width:'100%', height:'100%', objectFit:'cover', transition:'transform 0.4s',
                transform: hovered ? 'scale(1.08)' : 'scale(1)' }} />
          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center',
              flexDirection:'column', gap:8, color:'#3a4060' }}>
              <span style={{ fontSize:40 }}>🎬</span>
              <span style={{ fontSize:10, color:'#4a5070', textAlign:'center', padding:'0 8px' }}>{title}</span>
            </div>
        }
        {/* Hover overlay */}
        {hovered && (
          <div style={{ position:'absolute', inset:0, background:'rgba(7,8,15,0.55)',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8, flexDirection:'column' }}
            className="animate-in">
            <button onClick={handlePlay}
              style={{ width:48, height:48, borderRadius:'50%', border:'none', background:'#f0b429',
                color:'#07080f', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:'0 4px 20px rgba(240,180,41,0.5)', transition:'transform 0.15s' }}
              onMouseEnter={e=>e.currentTarget.style.transform='scale(1.1)'}
              onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
            >▶</button>
            <button onClick={(e) => { e.stopPropagation(); toggleWatchlist(item); }}
              style={{ padding:'4px 12px', borderRadius:20, border:`1px solid ${inWL?'#f0b429':'rgba(255,255,255,0.4)'}`,
                background: inWL?'#f0b42922':'transparent', color: inWL?'#f0b429':'white', fontSize:11,
                fontWeight:600, letterSpacing:'0.05em' }}>
              {inWL ? '✓ Saved' : '+ Watchlist'}
            </button>
          </div>
        )}
        {/* Rating badge */}
        {item.vote_average > 0 && (
          <div style={{ position:'absolute', top:8, left:8, background:'rgba(0,0,0,0.75)',
            padding:'2px 7px', borderRadius:6, fontSize:11, color:'#f0b429', fontWeight:700 }}>
            ★ {item.vote_average?.toFixed(1)}
          </div>
        )}
        {/* Type badge */}
        <div style={{ position:'absolute', top:8, right:8 }}
          className="badge" style2={{ background:'rgba(240,180,41,0.2)', color:'#f0b429',
            border:'1px solid #f0b42966', fontSize:9, padding:'2px 6px', borderRadius:4,
            position:'absolute', top:8, right:8 }}>
          <span className="badge" style={{ background:'rgba(240,180,41,0.15)', color:'#f0b429',
            border:'1px solid #f0b42944', fontSize:9, position:'absolute', top:8, right:8 }}>
            {mediaType === 'tv' ? 'SERIES' : 'FILM'}
          </span>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding:'10px 10px 12px' }}>
        <div style={{ fontWeight:600, fontSize:13, color:theme.text, whiteSpace:'nowrap',
          overflow:'hidden', textOverflow:'ellipsis', marginBottom:2 }}>{title}</div>
        <div style={{ fontSize:11, color:theme.textMuted }}>{year}</div>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 📜  HORIZONTAL SCROLL ROW
// ─────────────────────────────────────────────────────────────────────────────
const MovieRow = memo(({ title, endpoint, params = {}, icon = '🎬', skeletonCount = 8 }) => {
  const { theme } = useApp();
  const { data, loading, error, refetch } = useTMDB(endpoint, params);
  const items = data?.results || [];
  const rowRef = useRef();

  const scroll = (dir) => {
    if (rowRef.current) rowRef.current.scrollBy({ left: dir * 600, behavior: 'smooth' });
  };

  const header = (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, paddingRight:8 }}>
      <h2 style={{ fontFamily:'Cinzel', fontSize:18, fontWeight:700, color:theme.text, display:'flex',
        alignItems:'center', gap:10 }}>
        <span style={{ width:3, height:22, background:'#f0b429', borderRadius:2, display:'inline-block' }} />
        {icon} {title}
      </h2>
      {!error && (
        <div style={{ display:'flex', gap:8 }}>
          {['‹','›'].map((ch, i) => (
            <button key={i} type="button" onClick={() => scroll(i === 0 ? -1 : 1)}
              style={{ width:32, height:32, borderRadius:'50%', border:`1px solid ${theme.border}`,
                background: theme.bgCard, color:theme.text, fontSize:18, cursor:'pointer',
                transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center' }}
              onMouseEnter={e=>{e.currentTarget.style.background='#f0b429';e.currentTarget.style.color='#07080f';}}
              onMouseLeave={e=>{e.currentTarget.style.background=theme.bgCard;e.currentTarget.style.color=theme.text;}}>
              {ch}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (error) {
    return (
      <div style={{ marginBottom: 40 }} className="animate-in">
        {header}
        <div style={{
          padding:'16px 18px', borderRadius:12, border:`1px solid ${theme.border}`,
          background: theme.bgCard, color: theme.textMuted, fontSize:14, lineHeight:1.5,
        }}>
          <span style={{ color: theme.danger, fontWeight:600 }}>Couldn’t load this row.</span>
          {' '}{error}
          <button type="button" onClick={() => void refetch()}
            style={{ display:'block', marginTop:12, padding:'8px 18px', borderRadius:8, border:'none',
              background:'#f0b429', color:'#07080f', fontWeight:700, fontSize:13, cursor:'pointer' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 40 }} className="animate-in">
      {header}
      <div ref={rowRef} className="webcinema-row-scroll" style={{ paddingLeft:2, paddingRight:8, minHeight: loading || items.length ? undefined : 48 }}>
        {loading
          ? Array(skeletonCount).fill(0).map((_, i) => <SkeletonCard key={i} />)
          : items.length === 0
            ? <span style={{ color: theme.textDim, fontSize:14, padding:'8px 4px' }}>No titles returned.</span>
            : items.map(item => <MovieCard key={item.id} item={item} />)
        }
      </div>
    </div>
  );
});

// Hand-picked TMDB IDs — full detail fetched from the live API (movies / TV).
const WEB_CINEMA_SPOTLIGHT_MOVIE_IDS = Object.freeze([
  550, 27205, 603, 155, 680, 157336, 238, 299534, 19995, 502356, 278, 424, 120, 324857,
]);
const WEB_CINEMA_MORE_MOVIE_IDS = Object.freeze([
  122, 105, 497, 496243, 545611, 76341, 68718, 1726, 24428, 634649, 438631, 361743,
  299536, 99861, 575264, 98,
]);
/** Grid “list” on home — extra picks (no overlap with rows above). */
const WEB_CINEMA_LIBRARY_GRID_MOVIE_IDS = Object.freeze([
  569094, 453395, 500664, 393209, 766507, 697843, 575265, 667538, 912649, 913290,
  616037, 640146, 335977, 593643, 447365, 998022, 799766, 798286, 372058, 508947,
]);
const WEB_CINEMA_SPOTLIGHT_TV_IDS = Object.freeze([
  1396, 1399, 66732, 82856, 94997, 85271, 76479, 100088, 60574, 60622, 93484, 88396,
  92749, 83121, 83867, 95557, 119051, 76331, 68507, 94082,
]);

// ─────────────────────────────────────────────────────────────────────────────
// ✨  CURATED ROW (parallel /movie|tv/{id} — real catalogue entries)
// ─────────────────────────────────────────────────────────────────────────────
const CuratedIdsRow = memo(({ title, icon = '✨', ids, media, layout = 'row' }) => {
  const { theme } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const rowRef = useRef(null);
  const isGrid = layout === 'grid';

  useEffect(() => {
    if (!TMDB_API_KEY || !ids.length) {
      setItems([]);
      setLoading(false);
      setFetchErr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFetchErr(null);
      try {
        const settled = await Promise.allSettled(
          ids.map((id) =>
            tmdbHttp.get(`/${media}/${id}`, { params: { api_key: TMDB_API_KEY } }),
          ),
        );
        if (cancelled) return;
        const failed = settled.filter((s) => s.status === 'rejected');
        const ok = settled
          .filter((s) => s.status === 'fulfilled')
          .map((s) => s.value.data);
        setItems(ok);
        if (ok.length === 0 && failed.length) {
          const r = failed[0].reason;
          setFetchErr(formatTmdbAxiosError(r));
        }
      } catch (e) {
        if (!cancelled) setFetchErr(formatTmdbAxiosError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ids, media, reloadToken]);

  const scroll = (dir) => {
    if (rowRef.current) rowRef.current.scrollBy({ left: dir * 600, behavior: 'smooth' });
  };

  if (!TMDB_API_KEY) return null;

  if (!loading && items.length === 0 && fetchErr) {
    return (
      <div style={{ marginBottom: 40 }} className="animate-in">
        <h2 style={{ fontFamily:'Cinzel', fontSize:18, fontWeight:700, color:theme.text, display:'flex',
          alignItems:'center', gap:10, marginBottom:16 }}>
          <span style={{ width:3, height:22, background:'#f0b429', borderRadius:2, display:'inline-block' }} />
          {icon} {title}
        </h2>
        <div style={{
          padding:'16px 18px', borderRadius:12, border:`1px solid ${theme.border}`,
          background: theme.bgCard, color: theme.textMuted, fontSize:14,
        }}>
          <span style={{ color: theme.danger, fontWeight:600 }}>Couldn’t load curated titles.</span>
          {' '}{fetchErr}
          <button type="button" onClick={() => setReloadToken((t) => t + 1)}
            style={{ display:'block', marginTop:12, padding:'8px 18px', borderRadius:8, border:'none',
              background:'#f0b429', color:'#07080f', fontWeight:700, fontSize:13, cursor:'pointer' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!loading && items.length === 0) return null;

  const heading = (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      marginBottom: isGrid ? 20 : 16, paddingRight: isGrid ? 0 : 8,
    }}>
      <h2 style={{ fontFamily:'Cinzel', fontSize: isGrid ? 20 : 18, fontWeight:700, color:theme.text, display:'flex',
        alignItems:'center', gap:10 }}>
        <span style={{ width:3, height:22, background:'#f0b429', borderRadius:2, display:'inline-block' }} />
        {icon} {title}
      </h2>
      {!isGrid && (
        <div style={{ display:'flex', gap:8 }}>
          {['‹','›'].map((ch, i) => (
            <button key={i} type="button" onClick={() => scroll(i === 0 ? -1 : 1)}
              style={{ width:32, height:32, borderRadius:'50%', border:`1px solid ${theme.border}`,
                background: theme.bgCard, color:theme.text, fontSize:18, cursor:'pointer',
                transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center' }}
              onMouseEnter={e=>{e.currentTarget.style.background='#f0b429';e.currentTarget.style.color='#07080f';}}
              onMouseLeave={e=>{e.currentTarget.style.background=theme.bgCard;e.currentTarget.style.color=theme.text;}}>
              {ch}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const skelCount = Math.min(Math.max(ids.length, 8), 24);

  if (isGrid) {
    return (
      <div style={{ marginBottom: 48 }} className="animate-in">
        {heading}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
          gap: 16,
        }}>
          {loading
            ? Array(skelCount).fill(0).map((_, i) => <SkeletonCard key={i} />)
            : items.map((item) => (
              <MovieCard key={item.id} item={{ ...item, media_type: media }} size="lg" />
            ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 40 }} className="animate-in">
      {heading}
      <div ref={rowRef} className="webcinema-row-scroll" style={{ paddingLeft:2, paddingRight:8 }}>
        {loading
          ? Array(skelCount).fill(0).map((_, i) => <SkeletonCard key={i} />)
          : items.map((item) => (
            <MovieCard key={item.id} item={{ ...item, media_type: media }} />
          ))}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 🎯  HERO BANNER
// ─────────────────────────────────────────────────────────────────────────────
const HeroBanner = () => {
  const { theme, addContinueWatching, toggleWatchlist, isInWatchlist } = useApp();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useTMDB('/trending/all/day');
  const [idx, setIdx] = useState(0);
  const items  = useMemo(() => data?.results?.slice(0, 5) || [], [data]);
  const featured = items[idx];

  // Auto-rotate
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % items.length), 6000);
    return () => clearInterval(t);
  }, [items.length]);

  if (!TMDB_API_KEY) {
    return (
      <div style={{ position:'relative', height:'88vh', minHeight:520, overflow:'hidden',
        background:`linear-gradient(135deg, ${theme.bg} 0%, #1a1530 50%, ${theme.bgCard} 100%)`,
        display:'flex', alignItems:'center', justifyContent:'center', padding:'0 6vw' }}>
        <div style={{ maxWidth:560, textAlign:'center' }}>
          <h1 style={{ fontFamily:'Cinzel', fontSize:'clamp(26px,4vw,44px)', color:theme.text, marginBottom:16 }}>
            Welcome to Web Cinema
          </h1>
          <p style={{ color:theme.textMuted, fontSize:16, lineHeight:1.6, marginBottom:28 }}>
            Add your free TMDB API key to load real movies, series, posters, and trailers. Copy{' '}
            <code style={{ color:theme.accent }}>.env.example</code> to{' '}
            <code style={{ color:theme.accent }}>.env</code> and set{' '}
            <code style={{ color:theme.accent }}>VITE_NEXORA_TMDB_API_KEY</code>.
          </p>
          <a href={TMDB_KEY_URL} target="_blank" rel="noreferrer"
            style={{ display:'inline-block', padding:'14px 28px', borderRadius:10, background:'#f0b429',
              color:'#07080f', fontWeight:700, fontSize:15 }}>
            Get API key →
          </a>
        </div>
      </div>
    );
  }

  if (loading) return <div className="skeleton" style={{ height:'80vh', borderRadius:0 }} />;

  if (!featured) {
    return (
      <div style={{
        position:'relative', height:'88vh', minHeight:520, overflow:'hidden',
        background:`linear-gradient(135deg, ${theme.bg} 0%, #1a1530 45%, ${theme.bgCard} 100%)`,
        display:'flex', alignItems:'center', justifyContent:'center', padding:'0 6vw',
      }}>
        <div style={{ maxWidth:480, textAlign:'center' }}>
          <h1 style={{ fontFamily:'Cinzel', fontSize:'clamp(22px,4vw,36px)', color:theme.text, marginBottom:12 }}>
            {error ? 'Trending unavailable' : 'Nothing trending right now'}
          </h1>
          <p style={{ color:theme.textMuted, fontSize:15, lineHeight:1.6, marginBottom:20 }}>
            {error || 'Check your connection or TMDB API key, then try again.'}
          </p>
          <button type="button" onClick={() => void refetch()}
            style={{ padding:'12px 28px', borderRadius:10, border:'none', background:'#f0b429',
              color:'#07080f', fontWeight:700, fontSize:14, cursor:'pointer' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const bg    = featured.backdrop_path ? `${IMG_ORIG}${featured.backdrop_path}` : null;
  const title = featured.title || featured.name;
  const type  = featured.media_type || 'movie';
  const year  = (featured.release_date || featured.first_air_date || '').slice(0,4);
  const desc  = featured.overview?.slice(0, 180) + (featured.overview?.length > 180 ? '…' : '');
  const inWL  = isInWatchlist(featured.id);

  return (
    <div style={{ position:'relative', height:'88vh', minHeight:520, overflow:'hidden',
      marginBottom:0, background:'#07080f' }}>
      {/* Background image */}
      {bg && (
        <img key={bg} src={bg} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%',
          objectFit:'cover', opacity:0.45, transition:'opacity 0.8s' }} />
      )}
      {/* Gradient overlays */}
      <div style={{ position:'absolute', inset:0,
        background:'linear-gradient(90deg,rgba(7,8,15,0.95) 0%,rgba(7,8,15,0.6) 50%,rgba(7,8,15,0.1) 100%)' }} />
      <div style={{ position:'absolute', inset:0,
        background:'linear-gradient(0deg,rgba(7,8,15,1) 0%,transparent 50%)' }} />

      {/* Content */}
      <div className="hero-text" style={{ position:'absolute', bottom:'10%', left:0,
        padding:'0 5vw', maxWidth:'640px' }}>
        {/* Trending badge */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
          <span className="pulse" style={{ width:8, height:8, borderRadius:'50%', background:'#e8445a',
            display:'inline-block' }} />
          <span style={{ color:'#e8445a', fontSize:12, fontWeight:700, letterSpacing:'0.15em',
            textTransform:'uppercase' }}>Trending Now</span>
          <span style={{ color:'#f0b429', fontSize:12, fontWeight:600, marginLeft:4 }}>
            #{idx + 1} Today
          </span>
        </div>

        {/* Title */}
        <h1 style={{ fontFamily:'Cinzel', fontSize:'clamp(28px,5vw,56px)', fontWeight:900,
          color:'#fff', lineHeight:1.15, marginBottom:12, textShadow:'0 2px 20px rgba(0,0,0,0.8)' }}>
          {title}
        </h1>

        {/* Meta */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
          <Stars vote={featured.vote_average} />
          <span style={{ color:'#7a85a3', fontSize:13 }}>•</span>
          <span style={{ color:'#7a85a3', fontSize:13 }}>{year}</span>
          <span style={{ color:'#7a85a3', fontSize:13 }}>•</span>
          <span className="tag" style={{ background:'rgba(240,180,41,0.15)', color:'#f0b429',
            border:'1px solid #f0b42944', fontSize:12 }}>
            {type === 'tv' ? 'Series' : 'Movie'}
          </span>
          {featured.genre_ids?.slice(0,2).map(gid => (
            <span key={gid} className="tag" style={{ background:'rgba(255,255,255,0.08)',
              color:'#c8cfe0', fontSize:12 }}>{MOVIE_GENRES[gid]}</span>
          ))}
        </div>

        {/* Description */}
        <p style={{ color:'#b0b8cc', fontSize:15, lineHeight:1.65, marginBottom:28 }}>{desc}</p>

        {/* Buttons */}
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <button onClick={() => { addContinueWatching(featured); navigate(`/watch/${type}/${featured.id}`); }}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'13px 32px', borderRadius:10,
              border:'none', background:'#f0b429', color:'#07080f', fontWeight:700, fontSize:15,
              boxShadow:'0 4px 30px rgba(240,180,41,0.45)', transition:'all 0.2s' }}
            onMouseEnter={e=>e.currentTarget.style.background='#ffc94a'}
            onMouseLeave={e=>e.currentTarget.style.background='#f0b429'}>
            <span style={{ fontSize:18 }}>▶</span> Play Now
          </button>
          <button onClick={() => toggleWatchlist(featured)}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'13px 24px', borderRadius:10,
              border:`1px solid ${inWL ? '#f0b429' : 'rgba(255,255,255,0.25)'}`,
              background: inWL ? 'rgba(240,180,41,0.12)' : 'rgba(255,255,255,0.06)',
              color: inWL ? '#f0b429' : 'white', fontWeight:600, fontSize:14, transition:'all 0.2s' }}>
            {inWL ? '✓ In Watchlist' : '+ Watchlist'}
          </button>
          <button onClick={() => navigate(`/watch/${type}/${featured.id}?info=1`)}
            style={{ padding:'13px 20px', borderRadius:10, border:'1px solid rgba(255,255,255,0.15)',
              background:'rgba(255,255,255,0.04)', color:'#8a92aa', fontWeight:600, fontSize:14 }}>
            ℹ Info
          </button>
        </div>
      </div>

      {/* Dots */}
      <div style={{ position:'absolute', bottom:20, left:'50%', transform:'translateX(-50%)',
        display:'flex', gap:8 }}>
        {items.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)} style={{
            width: i === idx ? 24 : 8, height:8, borderRadius:99,
            background: i === idx ? '#f0b429' : 'rgba(255,255,255,0.25)',
            border:'none', padding:0, transition:'all 0.3s', cursor:'pointer' }} />
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ▶  CONTINUE WATCHING ROW
// ─────────────────────────────────────────────────────────────────────────────
const ContinueWatchingRow = () => {
  const { theme, continueWatching, removeContinue, addContinueWatching } = useApp();
  const navigate = useNavigate();

  if (continueWatching.length === 0) return null;

  return (
    <div style={{ marginBottom:40 }}>
      <h2 style={{ fontFamily:'Cinzel', fontSize:18, fontWeight:700, color:theme.text,
        marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ width:3, height:22, background:'#e8445a', borderRadius:2, display:'inline-block' }} />
        ⏯ Continue Watching
      </h2>
      <div className="webcinema-row-scroll">
        {continueWatching.map(item => {
          const title    = item.title || item.name;
          const progress = item.progress || 0;
          const poster   = item.poster_path ? `${IMG_W300}${item.poster_path}` : null;
          const type     = item.media_type || (item.title ? 'movie' : 'tv');

          return (
            <div key={item.id} style={{ minWidth:200, position:'relative', borderRadius:12, overflow:'hidden',
              background:theme.bgCard, border:`1px solid ${theme.border}`, cursor:'pointer',
              transition:'transform 0.2s' }}
              className="card-hover"
              onClick={() => { addContinueWatching(item, Math.min(progress + 5, 99)); navigate(`/watch/${type}/${item.id}`); }}>
              {/* Thumb */}
              <div style={{ height:110, background:'#0d1526', position:'relative' }}>
                {poster ? <img src={poster} alt={title} loading="lazy"
                  style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.7 }} /> : null}
                {/* Play icon */}
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
                  justifyContent:'center' }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(240,180,41,0.9)',
                    display:'flex', alignItems:'center', justifyContent:'center', color:'#07080f', fontSize:16 }}>▶</div>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ height:3, background:theme.border }}>
                <div style={{ height:'100%', width:`${progress}%`, background:'#f0b429',
                  borderRadius:99, transition:'width 0.3s' }} />
              </div>
              {/* Info */}
              <div style={{ padding:'8px 10px 10px', display:'flex', alignItems:'flex-start',
                justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:12, color:theme.text, whiteSpace:'nowrap',
                    overflow:'hidden', textOverflow:'ellipsis', maxWidth:140 }}>{title}</div>
                  <div style={{ fontSize:10, color:theme.textMuted, marginTop:2 }}>{progress}% watched</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeContinue(item.id); }}
                  style={{ background:'none', border:'none', color:theme.textDim, fontSize:16,
                    lineHeight:1, padding:2, borderRadius:4, transition:'color 0.15s' }}
                  onMouseEnter={e=>e.currentTarget.style.color='#e8445a'}
                  onMouseLeave={e=>e.currentTarget.style.color=theme.textDim}
                  title="Remove">✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 🔍  NAVBAR
// ─────────────────────────────────────────────────────────────────────────────
const Navbar = () => {
  const { theme, darkMode, setDarkMode, user, signUp, login, logout, notify, searchQuery, setSearchQuery } = useApp();
  const navigate    = useNavigate();
  const location    = useLocation();
  const [authOpen,  setAuthOpen]  = useState(false);
  const [authTab,   setAuthTab]   = useState('signin');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirmPw, setConfirmPw]= useState('');
  const [displayName, setDisplayName] = useState('');
  const debouncedQ  = useDebounce(searchQuery, 400);

  useEffect(() => {
    if (!authOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setAuthOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authOpen]);

  const authInput = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${theme.border}`,
    background: theme.bgOverlay,
    color: theme.text,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 10,
  };

  const closeAuthPanel = () => {
    setAuthOpen(false);
    setPassword('');
    setConfirmPw('');
  };

  const onSignIn = async (e) => {
    e.preventDefault();
    if (await login(email, password)) closeAuthPanel();
  };

  const onSignUp = async (e) => {
    e.preventDefault();
    if (password !== confirmPw) {
      notify('Passwords do not match.', 'warning');
      return;
    }
    if (await signUp(email, password, displayName)) {
      closeAuthPanel();
      setDisplayName('');
    }
  };

  useEffect(() => {
    if (debouncedQ.trim()) navigate(`/search?q=${encodeURIComponent(debouncedQ)}`);
  }, [debouncedQ, navigate]);

  const navLinks = [
    { label:'Home',      path:'/',          icon:'🏠' },
    { label:'Movies',    path:'/movies',    icon:'🎬' },
    { label:'Series',    path:'/series',    icon:'📺' },
    { label:'Watchlist', path:'/watchlist', icon:'📌' },
  ];

  return (
    <>
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:1000,
        background: theme.bgNav, backdropFilter:'blur(16px) saturate(180%)',
        borderBottom:`1px solid ${theme.border}`, padding:'0 4vw' }}>
        <div style={{ display:'flex', alignItems:'center', height:64, gap:24, maxWidth:1400, margin:'0 auto' }}>
          {/* Logo */}
          <Link to="/" style={{ fontFamily:'Cinzel', fontSize:'clamp(15px, 3.2vw, 22px)', fontWeight:900,
            color:'#f0b429', letterSpacing:'0.06em', flexShrink:0,
            textShadow:'0 0 20px rgba(240,180,41,0.5)', whiteSpace:'nowrap' }}>
            Web Cinema
          </Link>

          {/* Nav links — desktop */}
          <div style={{ display:'flex', gap:4, flexGrow:1 }}>
            {navLinks.map(l => (
              <Link key={l.path} to={l.path}
                style={{ padding:'6px 14px', borderRadius:8, fontSize:14, fontWeight:500,
                  color: location.pathname === l.path ? '#f0b429' : theme.textMuted,
                  background: location.pathname === l.path ? 'rgba(240,180,41,0.1)' : 'transparent',
                  transition:'all 0.2s' }}
                onMouseEnter={e=>{if(location.pathname!==l.path)e.currentTarget.style.color=theme.text;}}
                onMouseLeave={e=>{if(location.pathname!==l.path)e.currentTarget.style.color=theme.textMuted;}}>
                {l.label}
              </Link>
            ))}
          </div>

          {/* Search */}
          <div style={{ position:'relative', flexShrink:0 }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
              color:theme.textDim, fontSize:15, pointerEvents:'none' }}>🔍</span>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search movies, series..."
              style={{ padding:'8px 12px 8px 34px', borderRadius:10, border:`1px solid ${theme.border}`,
                background: theme.bgCard, color:theme.text, fontSize:13, width:220, outline:'none',
                transition:'border-color 0.2s' }}
              onFocus={e=>e.target.style.borderColor='#f0b429'}
              onBlur={e=>e.target.style.borderColor=theme.border} />
          </div>

          {/* Dark mode */}
          <button onClick={() => setDarkMode(d => !d)}
            style={{ width:36, height:36, borderRadius:'50%', border:`1px solid ${theme.border}`,
              background:theme.bgCard, cursor:'pointer', fontSize:17, transition:'all 0.2s',
              display:'flex', alignItems:'center', justifyContent:'center' }}
            title={darkMode?'Light Mode':'Dark Mode'}>
            {darkMode ? '☀️' : '🌙'}
          </button>

          {/* Auth */}
          <div style={{ position:'relative' }}>
            {user ? (
              <button type="button" onClick={() => setAuthOpen((o) => !o)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', borderRadius:10,
                  border:`1px solid ${theme.border}`, background:theme.bgCard, color:theme.text, fontSize:13,
                  maxWidth: 220 }}>
                <span>{user.avatar}</span>
                <span style={{ fontWeight:600, textAlign:'left', overflow:'hidden', textOverflow:'ellipsis',
                  whiteSpace:'nowrap' }}>{user.name}</span>
                {user.role === 'admin' && <span className="badge" style={{ background:'rgba(240,180,41,0.15)',
                  color:'#f0b429', border:'1px solid #f0b42944', fontSize:9, flexShrink:0 }}>ADMIN</span>}
              </button>
            ) : (
              <div style={{ display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
                <Link to="/signup" onClick={() => setAuthOpen(false)}
                  style={{ fontSize:13, color:theme.accent, fontWeight:700, whiteSpace:'nowrap' }}>
                  Sign up
                </Link>
                <Link to="/login" onClick={() => setAuthOpen(false)}
                  style={{ fontSize:13, color:theme.textMuted, fontWeight:600, whiteSpace:'nowrap' }}>
                  Full page
                </Link>
                <button type="button" onClick={() => { setAuthTab('signin'); setAuthOpen((o) => !o); }}
                  style={{ padding:'7px 18px', borderRadius:10, border:'none',
                    background:'#f0b429', color:'#07080f', fontWeight:700, fontSize:13, whiteSpace:'nowrap' }}>
                  Menu
                </button>
              </div>
            )}
            {authOpen && (
              <div className="animate-in" style={{ position:'absolute', right:0, top:'calc(100% + 8px)',
                background:theme.bgCard, border:`1px solid ${theme.border}`, borderRadius:12,
                padding:16, width:'min(320px, calc(100vw - 32px))', boxShadow:theme.shadow, zIndex:1001 }}>
                {user ? (
                  <>
                    <div style={{ paddingBottom:12, marginBottom:12, borderBottom:`1px solid ${theme.border}` }}>
                      <div style={{ fontWeight:700, fontSize:14, color:theme.text }}>{user.name}</div>
                      <div style={{ fontSize:12, color:theme.textMuted, wordBreak:'break-all', marginTop:4 }}>
                        {user.email}
                      </div>
                      <div style={{ fontSize:11, color:theme.textDim, marginTop:6 }}>Web Cinema · KRMU ID</div>
                    </div>
                    <button type="button" onClick={() => { logout(); setAuthOpen(false); }}
                      style={menuBtnStyle(theme)}>🚪 Sign out</button>
                  </>
                ) : (
                  <>
                    <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                      <button type="button" onClick={() => setAuthTab('signin')}
                        style={{ flex:1, padding:'8px', borderRadius:8, border:'none', cursor:'pointer',
                          fontWeight:600, fontSize:13,
                          background: authTab === 'signin' ? '#f0b429' : theme.bgOverlay,
                          color: authTab === 'signin' ? '#07080f' : theme.textMuted }}>
                        Sign in
                      </button>
                      <button type="button" onClick={() => setAuthTab('signup')}
                        style={{ flex:1, padding:'8px', borderRadius:8, border:'none', cursor:'pointer',
                          fontWeight:600, fontSize:13,
                          background: authTab === 'signup' ? '#f0b429' : theme.bgOverlay,
                          color: authTab === 'signup' ? '#07080f' : theme.textMuted }}>
                        Sign up
                      </button>
                    </div>
                    <p style={{ fontSize:12, color:theme.textMuted, marginBottom:14, lineHeight:1.5 }}>
                      Use an ID that includes <strong style={{ color:theme.accent }}>.krmu</strong> (e.g.{' '}
                      <span style={{ fontFamily:'monospace', fontSize:11 }}>roll.krmu@college.edu</span>).
                    </p>
                    {authTab === 'signin' ? (
                      <form onSubmit={onSignIn}>
                        <label style={{ fontSize:11, color:theme.textDim, display:'block', marginBottom:4 }}>Email / ID</label>
                        <input value={email} onChange={(ev) => setEmail(ev.target.value)}
                          placeholder="you.krmu@institution.edu" autoComplete="username" style={authInput} />
                        <label style={{ fontSize:11, color:theme.textDim, display:'block', marginBottom:4 }}>Password</label>
                        <input type="password" value={password} onChange={(ev) => setPassword(ev.target.value)}
                          autoComplete="current-password" style={authInput} />
                        <button type="submit"
                          style={{ width:'100%', padding:'10px', borderRadius:8, border:'none', cursor:'pointer',
                            background:'#f0b429', color:'#07080f', fontWeight:700, fontSize:14, marginTop:4 }}>
                          Sign in
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={onSignUp}>
                        <label style={{ fontSize:11, color:theme.textDim, display:'block', marginBottom:4 }}>Display name</label>
                        <input value={displayName} onChange={(ev) => setDisplayName(ev.target.value)}
                          placeholder="Your name" autoComplete="name" style={authInput} />
                        <label style={{ fontSize:11, color:theme.textDim, display:'block', marginBottom:4 }}>Email / ID</label>
                        <input value={email} onChange={(ev) => setEmail(ev.target.value)}
                          placeholder="you.krmu@institution.edu" autoComplete="username" style={authInput} />
                        <label style={{ fontSize:11, color:theme.textDim, display:'block', marginBottom:4 }}>Password</label>
                        <input type="password" value={password} onChange={(ev) => setPassword(ev.target.value)}
                          autoComplete="new-password" style={authInput} />
                        <label style={{ fontSize:11, color:theme.textDim, display:'block', marginBottom:4 }}>Confirm password</label>
                        <input type="password" value={confirmPw} onChange={(ev) => setConfirmPw(ev.target.value)}
                          autoComplete="new-password" style={authInput} />
                        <button type="submit"
                          style={{ width:'100%', padding:'10px', borderRadius:8, border:'none', cursor:'pointer',
                            background:'#f0b429', color:'#07080f', fontWeight:700, fontSize:14, marginTop:4 }}>
                          Create account
                        </button>
                      </form>
                    )}
                    <div style={{
                      marginTop: 12, paddingTop: 12, borderTop: `1px solid ${theme.border}`, textAlign: 'center',
                    }}>
                      <Link to="/login" onClick={() => setAuthOpen(false)}
                        style={{ fontSize: 12, color: theme.accent, fontWeight: 600 }}>Full sign-in page</Link>
                      <span style={{ color: theme.textDim, margin: '0 8px' }}>·</span>
                      <Link to="/signup" onClick={() => setAuthOpen(false)}
                        style={{ fontSize: 12, color: theme.accent, fontWeight: 600 }}>Full sign-up page</Link>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
      {/* Spacer */}
      <div style={{ height:64 }} />
    </>
  );
};

const menuBtnStyle = (theme) => ({
  width:'100%', padding:'9px 14px', textAlign:'left', border:'none',
  background:'transparent', color:theme.text, cursor:'pointer', borderRadius:8,
  fontSize:13, fontWeight:500, transition:'background 0.15s',
});

const authPageInput = (theme) => ({
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.bgOverlay,
  color: theme.text,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  marginBottom: 14,
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔑  FULL-PAGE LOGIN / SIGN UP
// ─────────────────────────────────────────────────────────────────────────────
const LoginPage = () => {
  const { theme, user, login } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const inp = authPageInput(theme);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (await login(email, password)) navigate('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 4vw', background: theme.bg,
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: theme.bgCard, border: `1px solid ${theme.border}`,
        borderRadius: 16, padding: '32px 28px', boxShadow: theme.shadow,
      }}>
        <h1 style={{ fontFamily: 'Cinzel', fontSize: 28, color: theme.text, marginBottom: 8 }}>Sign in</h1>
        <p style={{ color: theme.textMuted, fontSize: 14, marginBottom: 24, lineHeight: 1.55 }}>
          Use your KRMU institutional ID — it must include{' '}
          <strong style={{ color: theme.accent }}>.krmu</strong>.
        </p>
        <form onSubmit={onSubmit}>
          <label style={{ fontSize: 12, color: theme.textDim, display: 'block', marginBottom: 6 }}>Email / ID</label>
          <input value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="you.krmu@institution.edu"
            autoComplete="username" style={inp} />
          <label style={{ fontSize: 12, color: theme.textDim, display: 'block', marginBottom: 6 }}>Password</label>
          <input type="password" value={password} onChange={(ev) => setPassword(ev.target.value)}
            autoComplete="current-password" style={inp} />
          <button type="submit" disabled={busy}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: busy ? 'wait' : 'pointer',
              background: '#f0b429', color: '#07080f', fontWeight: 700, fontSize: 15, opacity: busy ? 0.85 : 1,
            }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p style={{ marginTop: 22, fontSize: 14, color: theme.textMuted, textAlign: 'center' }}>
          New here?{' '}
          <Link to="/signup" style={{ color: theme.accent, fontWeight: 700 }}>Create an account</Link>
        </p>
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <Link to="/" style={{ fontSize: 13, color: theme.textDim }}>← Back to Web Cinema</Link>
        </div>
      </div>
    </div>
  );
};

const SignUpPage = () => {
  const { theme, user, signUp, notify } = useApp();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const inp = authPageInput(theme);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPw) {
      notify('Passwords do not match.', 'warning');
      return;
    }
    setBusy(true);
    try {
      if (await signUp(email, password, displayName)) navigate('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 4vw', background: theme.bg,
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: theme.bgCard, border: `1px solid ${theme.border}`,
        borderRadius: 16, padding: '32px 28px', boxShadow: theme.shadow,
      }}>
        <h1 style={{ fontFamily: 'Cinzel', fontSize: 28, color: theme.text, marginBottom: 8 }}>Sign up</h1>
        <p style={{ color: theme.textMuted, fontSize: 14, marginBottom: 24, lineHeight: 1.55 }}>
          Register with an ID containing <strong style={{ color: theme.accent }}>.krmu</strong>. Passwords are hashed
          in your browser (demo app — use a unique password).
        </p>
        <form onSubmit={onSubmit}>
          <label style={{ fontSize: 12, color: theme.textDim, display: 'block', marginBottom: 6 }}>Display name</label>
          <input value={displayName} onChange={(ev) => setDisplayName(ev.target.value)} placeholder="Your name"
            autoComplete="name" style={inp} />
          <label style={{ fontSize: 12, color: theme.textDim, display: 'block', marginBottom: 6 }}>Email / ID</label>
          <input value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="you.krmu@institution.edu"
            autoComplete="username" style={inp} />
          <label style={{ fontSize: 12, color: theme.textDim, display: 'block', marginBottom: 6 }}>Password</label>
          <input type="password" value={password} onChange={(ev) => setPassword(ev.target.value)}
            autoComplete="new-password" style={inp} />
          <label style={{ fontSize: 12, color: theme.textDim, display: 'block', marginBottom: 6 }}>Confirm password</label>
          <input type="password" value={confirmPw} onChange={(ev) => setConfirmPw(ev.target.value)}
            autoComplete="new-password" style={inp} />
          <button type="submit" disabled={busy}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: busy ? 'wait' : 'pointer',
              background: '#f0b429', color: '#07080f', fontWeight: 700, fontSize: 15, opacity: busy ? 0.85 : 1,
            }}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p style={{ marginTop: 22, fontSize: 14, color: theme.textMuted, textAlign: 'center' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: theme.accent, fontWeight: 700 }}>Sign in</Link>
        </p>
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <Link to="/" style={{ fontSize: 13, color: theme.textDim }}>← Back to Web Cinema</Link>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 🏠  HOME PAGE
// ─────────────────────────────────────────────────────────────────────────────
const HomePage = () => {
  const { theme } = useApp();
  return (
    <div style={{ background:theme.bg, minHeight:'100vh' }}>
      <HeroBanner />
      <main
        style={{
          padding:'clamp(24px,5vw,40px) clamp(16px,4vw,48px)',
          paddingBottom: 56,
          maxWidth: 1400,
          margin: '0 auto',
          minHeight: 'min(32vh, 360px)',
        }}
      >
        <ContinueWatchingRow />
        <MovieRow title="Trending Movies Today" endpoint="/trending/movie/day" icon="⚡" skeletonCount={10} />
        <MovieRow title="Trending TV Today"     endpoint="/trending/tv/day"   icon="⚡" skeletonCount={10} />
        <MovieRow title="Trending All — Today"  endpoint="/trending/all/day"  icon="🌐" skeletonCount={10} />
        <CuratedIdsRow title="Web Cinema Spotlight — Curated Films" icon="✨" ids={WEB_CINEMA_SPOTLIGHT_MOVIE_IDS} media="movie" />
        <CuratedIdsRow title="More Movies to Explore" icon="🎞️" ids={WEB_CINEMA_MORE_MOVIE_IDS} media="movie" />
        <CuratedIdsRow title="Staff Picks — Series" icon="📌" ids={WEB_CINEMA_SPOTLIGHT_TV_IDS} media="tv" />
        <CuratedIdsRow
          title="Featured library — browse in a list"
          icon="📋"
          ids={WEB_CINEMA_LIBRARY_GRID_MOVIE_IDS}
          media="movie"
          layout="grid"
        />
        <MovieRow title="Trending This Week (All)" endpoint="/trending/all/week" icon="🔥" />
        <MovieRow title="Popular Movies"     endpoint="/movie/popular"    icon="🎬" params={{ region:'US' }} />
        <MovieRow title="Top Rated Films"    endpoint="/movie/top_rated"  icon="⭐" />
        <MovieRow title="Action & Adventure" endpoint="/discover/movie"   icon="💥" params={{ with_genres:'28,12', sort_by:'popularity.desc' }} />
        <MovieRow title="Popular TV Series"  endpoint="/tv/popular"        icon="📺" skeletonCount={10} />
        <MovieRow title="TV — Now Airing"    endpoint="/tv/on_the_air"     icon="📡" skeletonCount={10} />
        <MovieRow title="Upcoming Movies"    endpoint="/movie/upcoming"    icon="🗓️" params={{ region:'US' }} />
        <MovieRow title="Sci-Fi Universe"    endpoint="/discover/movie"   icon="🚀" params={{ with_genres:'878', sort_by:'vote_average.desc', 'vote_count.gte':500 }} />
        <MovieRow title="Critically Acclaimed" endpoint="/discover/movie" icon="🏆" params={{ sort_by:'vote_average.desc', 'vote_count.gte':1000 }} />
        <MovieRow title="New Releases"       endpoint="/movie/now_playing" icon="🆕" />
        <MovieRow title="Horror & Thriller"  endpoint="/discover/movie"   icon="👻" params={{ with_genres:'27,53', sort_by:'popularity.desc' }} />
      </main>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 🎬  MOVIES PAGE
// ─────────────────────────────────────────────────────────────────────────────
const MoviesPage = () => {
  const { theme, activeGenre, setActiveGenre } = useApp();
  const [page,      setPage]      = useState(1);
  const [sortBy,    setSortBy]    = useState('popularity.desc');
  const [allMovies, setAllMovies] = useState([]);

  const genreId = activeGenre;
  const { data, loading } = useTMDB('/discover/movie', {
    sort_by: sortBy, with_genres: genreId || undefined, page,
  });

  useEffect(() => {
    if (data?.results) {
      setAllMovies(prev => page === 1 ? data.results : [...prev, ...data.results]);
    }
  }, [data, page]);

  useEffect(() => { setPage(1); setAllMovies([]); }, [sortBy, genreId]);

  const sortOptions = [
    { v:'popularity.desc',      l:'Most Popular' },
    { v:'vote_average.desc',    l:'Top Rated' },
    { v:'release_date.desc',    l:'Newest First' },
    { v:'revenue.desc',         l:'Box Office' },
  ];

  const genreList = Object.entries(MOVIE_GENRES);

  return (
    <div style={{ background:theme.bg, minHeight:'100vh', padding:'32px 4vw' }}>
      <div style={{ maxWidth:1400, margin:'0 auto' }}>
        <h1 style={{ fontFamily:'Cinzel', fontSize:28, color:theme.text, marginBottom:24 }}>
          🎬 Explore Movies
        </h1>
        <MovieRow title="Trending movies — today" endpoint="/trending/movie/day" icon="⚡" skeletonCount={10} />
        <MovieRow title="Trending movies — this week" endpoint="/trending/movie/week" icon="🔥" skeletonCount={10} />
        <MovieRow title="Popular worldwide" endpoint="/movie/popular" icon="🎯" params={{ region:'US' }} />
        {/* Filters */}
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:28 }}>
          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ padding:'8px 14px', borderRadius:10, border:`1px solid ${theme.border}`,
              background:theme.bgCard, color:theme.text, fontSize:13, cursor:'pointer', outline:'none' }}>
            {sortOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          {/* Genre chips */}
          <button onClick={() => setActiveGenre(null)}
            style={chipStyle(theme, !genreId)}>All Genres</button>
          {genreList.slice(0,10).map(([id, name]) => (
            <button key={id} onClick={() => setActiveGenre(+id)}
              style={chipStyle(theme, genreId === +id)}>{name}</button>
          ))}
        </div>
        {/* Grid */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:16 }}>
          {allMovies.map(m => <MovieCard key={`${m.id}-${page}`} item={m} size="lg" />)}
          {loading && Array(8).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        {/* Load more */}
        {data && page < (data.total_pages || 1) && (
          <div style={{ textAlign:'center', marginTop:40 }}>
            <button onClick={() => setPage(p => p + 1)} disabled={loading}
              style={{ padding:'12px 36px', borderRadius:10, border:'none',
                background:'#f0b429', color:'#07080f', fontWeight:700, fontSize:14,
                cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Loading…' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const chipStyle = (theme, active) => ({
  padding:'7px 16px', borderRadius:20, border:`1px solid ${active ? '#f0b429' : theme.border}`,
  background: active ? 'rgba(240,180,41,0.15)' : theme.bgCard, color: active ? '#f0b429' : theme.textMuted,
  fontSize:13, cursor:'pointer', fontWeight: active ? 600 : 400, transition:'all 0.2s',
});

// ─────────────────────────────────────────────────────────────────────────────
// 📺  SERIES PAGE
// ─────────────────────────────────────────────────────────────────────────────
const SeriesPage = () => {
  const { theme } = useApp();
  return (
    <div style={{ background:theme.bg, minHeight:'100vh', padding:'32px 4vw' }}>
      <div style={{ maxWidth:1400, margin:'0 auto' }}>
        <h1 style={{ fontFamily:'Cinzel', fontSize:28, color:theme.text, marginBottom:32 }}>
          📺 TV Series
        </h1>
        <MovieRow title="Trending TV — today" endpoint="/trending/tv/day" icon="⚡" skeletonCount={10} />
        <MovieRow title="Trending TV — this week" endpoint="/trending/tv/week" icon="🔥" skeletonCount={10} />
        <MovieRow title="Airing today" endpoint="/tv/airing_today" icon="📅" skeletonCount={10} />
        <MovieRow title="Currently Airing"  endpoint="/tv/on_the_air"   icon="📡" skeletonCount={10} />
        <MovieRow title="Top Rated Series"  endpoint="/tv/top_rated"     icon="⭐" />
        <MovieRow title="Popular Series"    endpoint="/tv/popular"       icon="🔥" />
        <MovieRow title="Drama"             endpoint="/discover/tv"      icon="🎭" params={{ with_genres:'18', sort_by:'popularity.desc' }} />
        <MovieRow title="Crime & Thriller"  endpoint="/discover/tv"      icon="🕵️" params={{ with_genres:'80,9648', sort_by:'vote_average.desc', 'vote_count.gte':200 }} />
        <MovieRow title="Sci-Fi Series"     endpoint="/discover/tv"      icon="🛸" params={{ with_genres:'10765', sort_by:'popularity.desc' }} />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 🔍  SEARCH PAGE
// ─────────────────────────────────────────────────────────────────────────────
const SearchPage = () => {
  const { theme, searchQuery }  = useApp();
  const location = useLocation();
  const q        = new URLSearchParams(location.search).get('q') || searchQuery;
  const [page,   setPage]  = useState(1);
  const [filter, setFilter]= useState('multi');
  const [sort,   setSort]  = useState('popularity');
  const [results,setResults]= useState([]);

  const { data, loading } = useTMDB(q ? `/search/${filter}` : null, { query: q, page });

  useEffect(() => {
    setPage(1); setResults([]);
  }, [q, filter]);

  useEffect(() => {
    if (data?.results) {
      const sorted = [...data.results].sort((a, b) =>
        sort === 'popularity' ? (b.popularity||0) - (a.popularity||0) : (b.vote_average||0) - (a.vote_average||0)
      );
      setResults(prev => page === 1 ? sorted : [...prev, ...sorted]);
    }
  }, [data, sort, page]);

  const filters = [{ v:'multi',l:'All'},{v:'movie',l:'Movies'},{v:'tv',l:'Series'},{v:'person',l:'People'}];

  return (
    <div style={{ background:theme.bg, minHeight:'100vh', padding:'32px 4vw' }}>
      <div style={{ maxWidth:1400, margin:'0 auto' }}>
        <h1 style={{ fontFamily:'Cinzel', fontSize:24, color:theme.text, marginBottom:8 }}>
          🔍 Results for "{q}"
        </h1>
        <p style={{ color:theme.textMuted, fontSize:14, marginBottom:24 }}>
          {data?.total_results?.toLocaleString()} results found
        </p>
        {/* Filter + Sort bar */}
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:28, alignItems:'center' }}>
          {filters.map(f => (
            <button key={f.v} onClick={() => setFilter(f.v)} style={chipStyle(theme, filter === f.v)}>
              {f.l}
            </button>
          ))}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ color:theme.textMuted, fontSize:13 }}>Sort:</span>
            {[{v:'popularity',l:'Popular'},{v:'rating',l:'Rating'}].map(s=>(
              <button key={s.v} onClick={()=>setSort(s.v)} style={chipStyle(theme, sort===s.v)}>
                {s.l}
              </button>
            ))}
          </div>
        </div>
        {/* Results grid */}
        {!q && <p style={{ color:theme.textMuted, textAlign:'center', padding:60 }}>Type something to search…</p>}
        <div style={{ display:'flex', flexWrap:'wrap', gap:16 }}>
          {results.filter(r => r.poster_path || r.backdrop_path).map(item => (
            <MovieCard key={item.id} item={item} size="lg" />
          ))}
          {loading && Array(8).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        {results.length > 0 && data && page < (data.total_pages||1) && (
          <div style={{ textAlign:'center', marginTop:32 }}>
            <button onClick={() => setPage(p => p + 1)} style={{ padding:'11px 32px', borderRadius:10,
              border:'none', background:'#f0b429', color:'#07080f', fontWeight:700, cursor:'pointer' }}>
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 📌  WATCHLIST PAGE
// ─────────────────────────────────────────────────────────────────────────────
const WatchlistPage = () => {
  const { theme, watchlist, toggleWatchlist, user } = useApp();

  if (!user) return (
    <div style={{ minHeight:'80vh', display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', gap:16, color:theme.text, background:theme.bg }}>
      <span style={{ fontSize:64 }}>🔒</span>
      <h2 style={{ fontFamily:'Cinzel', fontSize:22 }}>Sign In Required</h2>
      <p style={{ color:theme.textMuted }}>Please sign in to access your Watchlist.</p>
      <Link to="/" style={{ padding:'10px 28px', borderRadius:10, background:'#f0b429',
        color:'#07080f', fontWeight:700, fontSize:14 }}>Go Home</Link>
    </div>
  );

  return (
    <div style={{ background:theme.bg, minHeight:'100vh', padding:'32px 4vw' }}>
      <div style={{ maxWidth:1400, margin:'0 auto' }}>
        <h1 style={{ fontFamily:'Cinzel', fontSize:28, color:theme.text, marginBottom:8 }}>
          📌 My Watchlist
        </h1>
        <p style={{ color:theme.textMuted, fontSize:14, marginBottom:32 }}>
          {watchlist.length} title{watchlist.length !== 1 ? 's' : ''} saved
        </p>
        {watchlist.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px 0', color:theme.textMuted }}>
            <div style={{ fontSize:64, marginBottom:16 }}>🎬</div>
            <h3 style={{ fontSize:18, marginBottom:8, color:theme.text }}>Your watchlist is empty</h3>
            <p style={{ marginBottom:24 }}>Browse movies and click "+ Watchlist" to save them here.</p>
            <Link to="/" style={{ padding:'10px 28px', borderRadius:10, background:'#f0b429',
              color:'#07080f', fontWeight:700 }}>Explore Content</Link>
          </div>
        ) : (
          <div style={{ display:'flex', flexWrap:'wrap', gap:16 }}>
            {watchlist.map(item => (
              <div key={item.id} style={{ position:'relative' }}>
                <MovieCard item={item} size="lg" />
                <button onClick={() => toggleWatchlist(item)}
                  style={{ position:'absolute', top:8, right:8, width:26, height:26, borderRadius:'50%',
                    border:'none', background:'rgba(232,68,90,0.85)', color:'white', cursor:'pointer',
                    fontSize:12, display:'flex', alignItems:'center', justifyContent:'center',
                    zIndex:10, backdropFilter:'blur(4px)' }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ▶  WATCH PAGE
// ─────────────────────────────────────────────────────────────────────────────
const WatchPage = () => {
  const { theme, addContinueWatching, toggleWatchlist, isInWatchlist } = useApp();
  const { type, id } = useParams();
  const navigate     = useNavigate();
  const [playing,    setPlaying]    = useState(false);
  const [progress,   setProgress]   = useState(0);
  const intervalRef                 = useRef(null);

  useEffect(() => {
    setProgress(0);
    setPlaying(false);
  }, [type, id]);

  const { data: movie, loading } = useTMDB(`/${type}/${id}`);
  const { data: credits }        = useTMDB(`/${type}/${id}/credits`);
  const { data: similar }        = useTMDB(`/${type}/${id}/similar`);
  const { data: videos }         = useTMDB(`/${type}/${id}/videos`);

  const trailerKey = videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key;
  const inWL       = isInWatchlist(+id);
  const cast       = credits?.cast?.slice(0, 8) || [];

  useEffect(() => {
    if (movie) addContinueWatching({ ...movie, media_type: type }, progress);
    // Progress updates are handled in the playback interval below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie]);

  // Simulate playback progress
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setProgress(p => {
          if (p >= 99) { setPlaying(false); clearInterval(intervalRef.current); return 99; }
          const np = Math.min(p + 0.3, 99);
          addContinueWatching({ ...movie, media_type: type }, Math.round(np));
          return np;
        });
      }, 300);
    } else clearInterval(intervalRef.current);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  if (loading) return <div style={{ background:theme.bg, minHeight:'100vh' }}><Spinner size={48} /></div>;
  if (!movie)  return <div style={{ padding:40, color:theme.textMuted }}>Not found.</div>;

  const title     = movie.title || movie.name;
  const year      = (movie.release_date || movie.first_air_date || '').slice(0, 4);
  const runtime   = movie.runtime ? `${Math.floor(movie.runtime/60)}h ${movie.runtime%60}m` : null;
  const genres    = movie.genres?.map(g => g.name).join(', ');
  const backdrop  = movie.backdrop_path ? `${IMG_ORIG}${movie.backdrop_path}` : null;
  const poster    = movie.poster_path   ? `${IMG_W500}${movie.poster_path}`   : null;

  return (
    <div style={{ background:theme.bg, minHeight:'100vh' }}>
      {/* Player Section */}
      <div style={{ position:'relative', background:'#000', maxHeight:'70vh',
        minHeight:300, overflow:'hidden' }}>
        {/* Background */}
        {backdrop && !playing && (
          <img src={backdrop} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.4 }} />
        )}
        {/* YouTube Embed */}
        {playing && trailerKey && (
          <iframe
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&controls=1`}
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none' }}
            allow="autoplay; encrypted-media" allowFullScreen />
        )}
        {/* Overlay controls */}
        {!playing && (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center',
            background:'linear-gradient(0deg,rgba(7,8,15,0.85) 0%,transparent 60%)' }}>
            <button onClick={() => setPlaying(true)}
              style={{ width:80, height:80, borderRadius:'50%', border:'none',
                background:'rgba(240,180,41,0.9)', color:'#07080f', fontSize:32,
                cursor:'pointer', boxShadow:'0 0 40px rgba(240,180,41,0.5)', transition:'transform 0.2s' }}
              onMouseEnter={e=>e.currentTarget.style.transform='scale(1.1)'}
              onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
            >▶</button>
            {trailerKey && <p style={{ color:'rgba(255,255,255,0.6)', marginTop:12, fontSize:13 }}>
              Watch Trailer</p>}
          </div>
        )}
        {/* Back button */}
        <button onClick={() => { setPlaying(false); navigate(-1); }}
          style={{ position:'absolute', top:16, left:16, padding:'8px 16px', borderRadius:8,
            border:'1px solid rgba(255,255,255,0.2)', background:'rgba(0,0,0,0.5)',
            color:'white', cursor:'pointer', fontSize:13, fontWeight:600, zIndex:10 }}>
          ← Back
        </button>
        {/* Progress bar */}
        {progress > 0 && (
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:4, background:'rgba(255,255,255,0.1)' }}>
            <div style={{ height:'100%', width:`${progress}%`, background:'#f0b429',
              transition:'width 0.3s', borderRadius:99 }} />
          </div>
        )}
      </div>

      {/* Movie Info */}
      <div style={{ maxWidth:1400, margin:'0 auto', padding:'32px 4vw' }}>
        <div style={{ display:'flex', gap:32, flexWrap:'wrap' }}>
          {/* Poster */}
          {poster && (
            <img src={poster} alt={title} style={{ width:200, borderRadius:16, flexShrink:0,
              boxShadow:theme.shadow, display:'block' }} />
          )}
          {/* Details */}
          <div style={{ flex:1, minWidth:280 }}>
            <h1 style={{ fontFamily:'Cinzel', fontSize:'clamp(22px,4vw,40px)', fontWeight:900,
              color:theme.text, marginBottom:12 }}>{title}</h1>
            {/* Meta row */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:16, alignItems:'center' }}>
              <Stars vote={movie.vote_average} />
              {year && <span style={{ color:theme.textMuted, fontSize:13 }}>{year}</span>}
              {runtime && <span className="tag" style={{ background:theme.bgCard, color:theme.textMuted, fontSize:12,
                border:`1px solid ${theme.border}` }}>{runtime}</span>}
              {genres && <span style={{ color:theme.textMuted, fontSize:13 }}>{genres}</span>}
            </div>
            {/* Tagline */}
            {movie.tagline && (
              <p style={{ color:'#f0b429', fontSize:15, fontStyle:'italic', marginBottom:12 }}>
                "{movie.tagline}"
              </p>
            )}
            {/* Overview */}
            <p style={{ color:theme.textMuted, lineHeight:1.75, fontSize:15, marginBottom:24,
              maxWidth:700 }}>{movie.overview}</p>
            {/* Action buttons */}
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              <button onClick={() => setPlaying(p => !p)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 28px', borderRadius:10,
                  border:'none', background:'#f0b429', color:'#07080f', fontWeight:700, fontSize:14,
                  cursor:'pointer', transition:'background 0.2s' }}
                onMouseEnter={e=>e.currentTarget.style.background='#ffc94a'}
                onMouseLeave={e=>e.currentTarget.style.background='#f0b429'}>
                {playing ? '⏸ Pause' : '▶ Play'} {trailerKey ? 'Trailer' : ''}
              </button>
              <button onClick={() => toggleWatchlist({ ...movie, media_type: type })}
                style={{ padding:'12px 22px', borderRadius:10,
                  border:`1px solid ${inWL ? '#f0b429' : theme.border}`,
                  background: inWL ? 'rgba(240,180,41,0.1)' : theme.bgCard,
                  color: inWL ? '#f0b429' : theme.text, fontWeight:600, fontSize:13, cursor:'pointer' }}>
                {inWL ? '✓ In Watchlist' : '+ Watchlist'}
              </button>
              {movie.homepage && (
                <a href={movie.homepage} target="_blank" rel="noreferrer"
                  style={{ padding:'12px 18px', borderRadius:10, border:`1px solid ${theme.border}`,
                    background:theme.bgCard, color:theme.textMuted, fontSize:13, fontWeight:600 }}>
                  🌐 Official Site
                </a>
              )}
            </div>
            {/* Stats */}
            <div style={{ display:'flex', gap:24, marginTop:24, flexWrap:'wrap' }}>
              {[
                { l:'Popularity', v: Math.round(movie.popularity).toLocaleString() },
                { l:'Votes', v: movie.vote_count?.toLocaleString() },
                type === 'movie' && movie.budget > 0 && { l:'Budget', v:`$${(movie.budget/1e6).toFixed(0)}M` },
                type === 'movie' && movie.revenue > 0 && { l:'Revenue', v:`$${(movie.revenue/1e6).toFixed(0)}M` },
                type === 'tv' && { l:'Seasons', v: movie.number_of_seasons },
                type === 'tv' && { l:'Episodes', v: movie.number_of_episodes },
              ].filter(Boolean).map(s => (
                <div key={s.l} style={{ textAlign:'center', padding:'10px 16px', borderRadius:10,
                  background:theme.bgCard, border:`1px solid ${theme.border}` }}>
                  <div style={{ fontSize:18, fontWeight:700, color:'#f0b429' }}>{s.v}</div>
                  <div style={{ fontSize:11, color:theme.textMuted, marginTop:2 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cast */}
        {cast.length > 0 && (
          <div style={{ marginTop:48 }}>
            <h2 style={{ fontFamily:'Cinzel', fontSize:20, color:theme.text, marginBottom:20,
              display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ width:3, height:22, background:'#f0b429', borderRadius:2, display:'inline-block' }} />
              🎭 Cast
            </h2>
            <div className="webcinema-row-scroll" style={{ gap:16 }}>
              {cast.map(person => (
                <div key={person.id} style={{ minWidth:100, textAlign:'center' }}>
                  <div style={{ width:80, height:80, borderRadius:'50%', margin:'0 auto 8px',
                    overflow:'hidden', background:theme.bgCard, border:`2px solid ${theme.border}` }}>
                    {person.profile_path
                      ? <img src={`${IMG_W300}${person.profile_path}`} alt={person.name}
                          style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center',
                          justifyContent:'center', fontSize:28, color:theme.textDim }}>👤</div>
                    }
                  </div>
                  <div style={{ fontSize:12, fontWeight:600, color:theme.text, marginBottom:2 }}>{person.name}</div>
                  <div style={{ fontSize:11, color:theme.textMuted }}>{person.character}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Similar */}
        {similar?.results?.length > 0 && (
          <div style={{ marginTop:48 }}>
            <MovieRow title="More Like This" endpoint={`/${type}/${id}/similar`} icon="🎞️" />
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 🦶  FOOTER
// ─────────────────────────────────────────────────────────────────────────────
const Footer = () => {
  const { theme } = useApp();
  return (
    <footer style={{ background:theme.bgOverlay, borderTop:`1px solid ${theme.border}`,
      padding:'40px 4vw 24px', marginTop:40 }}>
      <div style={{ maxWidth:1400, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
          flexWrap:'wrap', gap:24, marginBottom:32 }}>
          <div>
            <div style={{ fontFamily:'Cinzel', fontSize:24, fontWeight:900, color:'#f0b429',
              marginBottom:8, textShadow:'0 0 20px rgba(240,180,41,0.3)' }}>Web Cinema</div>
            <p style={{ color:theme.textMuted, fontSize:13, maxWidth:280 }}>
              Your cinematic universe. Powered by TMDB.
            </p>
          </div>
          {[
            { title:'Browse', links:['Home','Movies','Series','Watchlist'] },
            { title:'Info',   links:['About','Contact','Privacy','Terms'] },
          ].map(col => (
            <div key={col.title}>
              <div style={{ fontWeight:700, fontSize:13, color:theme.text, marginBottom:12,
                letterSpacing:'0.05em', textTransform:'uppercase' }}>{col.title}</div>
              {col.links.map(l => (
                <div key={l} style={{ fontSize:13, color:theme.textMuted, marginBottom:8,
                  cursor:'pointer', transition:'color 0.2s' }}
                  onMouseEnter={e=>e.currentTarget.style.color='#f0b429'}
                  onMouseLeave={e=>e.currentTarget.style.color=theme.textMuted}>{l}</div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop:`1px solid ${theme.border}`, paddingTop:20, display:'flex',
          justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <span style={{ color:theme.textDim, fontSize:12 }}>
            © 2026 Web Cinema. Built with React + TMDB API.
          </span>
          <span style={{ color:theme.textDim, fontSize:12 }}>
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </span>
        </div>
      </div>
    </footer>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 🔐  API KEY REMINDER (all catalogue data comes from TMDB)
// ─────────────────────────────────────────────────────────────────────────────
const ApiKeyBanner = () => {
  const { theme } = useApp();
  if (TMDB_API_KEY) return null;
  return (
    <div style={{
      padding:'12px 4vw', textAlign:'center', fontSize:13, color:theme.text,
      background:'linear-gradient(90deg, rgba(240,180,41,0.14), rgba(232,68,90,0.08))',
      borderBottom:`1px solid ${theme.border}`,
    }}>
      <strong style={{ color:theme.accent }}>TMDB API key missing.</strong>
      {' '}Create <code style={{ color:theme.textMuted }}>.env</code> with{' '}
      <code style={{ color:theme.textMuted }}>VITE_NEXORA_TMDB_API_KEY=…</code>
      {' '}(see <code style={{ color:theme.textMuted }}>.env.example</code>; legacy{' '}
      <code style={{ color:theme.textMuted }}>VITE_TMDB_API_KEY</code> also works) —{' '}
      <a href={TMDB_KEY_URL} target="_blank" rel="noreferrer" style={{ color:theme.accent, fontWeight:600 }}>
        get a free key
      </a>
      {' '}· restart <code style={{ color:theme.textMuted }}>npm run dev</code> after saving.
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 🚀  ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
const Layout = ({ children }) => {
  const { theme } = useApp();
  return (
    <div style={{ background:theme.bg, minHeight:'100vh', color:theme.text }}>
      <Navbar />
      <ApiKeyBanner />
      <ErrorBoundary>
        <Suspense fallback={<Spinner size={48} />}>
          {children}
        </Suspense>
      </ErrorBoundary>
      <Footer />
      <Toast />
    </div>
  );
};

export default function App() {
  return (
    <>
      <GlobalStyles />
      <AppProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/"           element={<HomePage />} />
              <Route path="/login"      element={<LoginPage />} />
              <Route path="/signup"     element={<SignUpPage />} />
              <Route path="/movies"     element={<MoviesPage />} />
              <Route path="/series"     element={<SeriesPage />} />
              <Route path="/search"     element={<SearchPage />} />
              <Route path="/watchlist"  element={<WatchlistPage />} />
              <Route path="/watch/:type/:id" element={<WatchPage />} />
              <Route path="*"           element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </AppProvider>
    </>
  );
}