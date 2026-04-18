// portalState.js - Handles Authentication and User Profiles globally

const SUPABASE_URL  = 'https://vcquollgfqbgofrgxfha.supabase.co';
const SUPABASE_ANON = 'sb_publishable_-Y5NFc5q_msiatgFLVeFTA_FK0lKS2F';

if (!window.supabase) {
  console.error('[PortalState] Supabase library not found.');
} else {
  const { createClient } = window.supabase;

  // Edge tracking prevention blocks sessionStorage/localStorage
  // Fall back to in-memory storage so the app still works
  let storageAdapter;
  try {
    sessionStorage.setItem('_test', '1');
    sessionStorage.removeItem('_test');
    storageAdapter = undefined; // use default (sessionStorage)
  } catch (e) {
    console.warn('[PortalState] sessionStorage blocked — using in-memory storage (Edge tracking prevention).');
    const memStore = {};
    storageAdapter = {
      getItem:    (key)        => memStore[key] ?? null,
      setItem:    (key, value) => { memStore[key] = value; },
      removeItem: (key)        => { delete memStore[key]; },
    };
  }

  window.db = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession:      true,
      autoRefreshToken:    true,
      detectSessionInUrl:  true,
      ...(storageAdapter ? { storage: storageAdapter } : {})
    }
  });

  window.portalState = { Session: null, Profile: null, isLoaded: false };

  async function initializePortal() {
    const { data: { session }, error } = await window.db.auth.getSession();

    const isLoginScreen = window.location.pathname === '/'
      || window.location.pathname === '/index.html'
      || window.location.pathname.includes('/auth/callback.html');

    if (!session || error) {
      if (!isLoginScreen) {
        window.location.href = '/index.html?error=access_denied';
      }
      return;
    }

    if (isLoginScreen && session) {
      window.location.href = '/tracker/index.html';
      return;
    }

    const { data: profile } = await window.db
      .from('profiles')
      .select('id, email, full_name, role, manager_id, is_active')
      .eq('id', session.user.id)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      if (!isLoginScreen) {
        await window.db.auth.signOut();
        window.location.href = '/index.html?error=account_inactive';
      }
      return;
    }

    window.portalState.Session = session;
    window.portalState.Profile = profile;
    window.portalState.isLoaded = true;

    window.dispatchEvent(new Event('portalStateLoaded'));
  }

  initializePortal();
}
