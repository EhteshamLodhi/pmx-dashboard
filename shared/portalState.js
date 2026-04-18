// portalState.js - Handles Authentication and User Profiles globally

const SUPABASE_URL  = 'https://vcquollgfqbgofrgxfha.supabase.co';
const SUPABASE_ANON = 'sb_publishable_-Y5NFc5q_msiatgFLVeFTA_FK0lKS2F';

// Ensure supabase is loaded via CDN first
if (!window.supabase) {
  console.error('[PortalState] Supabase library not found. Ensure script tag is included before Layout.');
} else {
  const { createClient } = window.supabase;
  window.db = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  window.portalState = { Session: null, Profile: null, isLoaded: false };

  async function initializePortal() {
    const { data: { session }, error } = await window.db.auth.getSession();
    
    const isLoginScreen = window.location.pathname === '/' || window.location.pathname === '/index.html' || window.location.pathname.includes('/auth/callback.html');

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
