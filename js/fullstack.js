(async function initFullstackFeatures() {
  const state = {
    supabase: null,
    session: null,
    profile: null,
    gameSession: null,
    queuePolling: null
  };

  const ctx = window.chkobbaSessionContext;
  if (!ctx) return;

  window.chkobbaQueueForMatch = async function queueStub() {
    let msg = 'Ranked queue: add SUPABASE_URL and SUPABASE_ANON_KEY to .env, save, then restart the server.';
    try {
      const cfg = await (await fetch('/api/config')).json();
      if (cfg.missingEnv && cfg.missingEnv.length) {
        const m = cfg.missingEnv;
        let hint = 'Supabase → Project Settings → API: set Project URL, anon key, and service_role (secret). Restart the server.';
        if (m.length === 1 && m[0] === 'SUPABASE_SERVICE_ROLE_KEY') {
          hint = 'Same API page: under "Project API keys", reveal and copy the service_role key (secret, server-only). Paste as SUPABASE_SERVICE_ROLE_KEY in .env, restart.';
        } else if (m.includes('SUPABASE_SERVICE_ROLE_KEY')) {
          hint += ' Include service_role — not the anon key.';
        }
        msg = `Missing in .env: ${m.join(', ')}. ${hint}`;
      }
    } catch (_) { /* ignore */ }
    if (typeof window.showToast === 'function') window.showToast(msg, 12000);
  };

  function el(tag, attrs = {}, html = '') {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (html) node.innerHTML = html;
    return node;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Must match server usernameToGameEmail (sign-in only — register uses /api/auth/register). */
  function usernameToEmail(username) {
    const slug = (username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (slug.length < 3 || slug.length > 32) {
      throw new Error('Username: use 3–32 letters, numbers, or _ only.');
    }
    return `${slug}@chkobba.game`;
  }

  function authErrorMessage(err) {
    const m = err?.message || String(err);
    if (/Invalid login credentials/i.test(m)) return 'Wrong username or password.';
    return m;
  }

  function authHeader() {
    if (!state.session?.access_token) return {};
    return { Authorization: `Bearer ${state.session.access_token}` };
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
        ...authHeader()
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function mountPanel() {
    const panel = el('div', { id: 'fullstack-panel', style: 'position:fixed;bottom:16px;right:16px;z-index:9999;background:rgba(0,0,0,0.84);color:#fff;padding:12px;border-radius:12px;width:320px;font-family:Arial,sans-serif;backdrop-filter:blur(8px);border:1px solid rgba(255,215,0,0.35);' });
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="color:#ffd700;">Account & stats</strong>
        <button id="fs-refresh" style="background:#222;color:#fff;border:1px solid #555;border-radius:6px;padding:4px 8px;cursor:pointer;">Refresh</button>
      </div>
      <div id="fs-auth"></div>
      <hr style="border-color:rgba(255,255,255,0.15);margin:8px 0;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button id="fs-top" style="flex:1;background:#334155;color:#fff;border:0;border-radius:6px;padding:8px;cursor:pointer;">Top Players</button>
        <button id="fs-history" style="flex:1;background:#334155;color:#fff;border:0;border-radius:6px;padding:8px;cursor:pointer;">Game History</button>
      </div>
      <div id="fs-out" style="max-height:240px;overflow:auto;margin-top:8px;font-size:13px;"></div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#fs-refresh').addEventListener('click', refreshAll);
    panel.querySelector('#fs-top').addEventListener('click', showLeaderboard);
    panel.querySelector('#fs-history').addEventListener('click', showHistory);
  }

  function renderAuth() {
    const node = document.getElementById('fs-auth');
    if (!node) return;
    if (state.profile) {
      node.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
          <div>
            <div><b>${escapeHtml(state.profile.username)}</b></div>
            <div style="color:#ffd700;font-size:13px;">ELO ${state.profile.total_elo}</div>
          </div>
          <button id="fs-logout" type="button" style="background:#7f1d1d;color:#fff;border:0;border-radius:6px;padding:6px 8px;cursor:pointer;">Out</button>
        </div>`;
      const logout = document.getElementById('fs-logout');
      if (logout) logout.onclick = async () => {
        await state.supabase.auth.signOut();
        state.session = null;
        state.profile = null;
        renderAuth();
      };
      return;
    }
    node.innerHTML = `
      <div style="font-size:11px;opacity:0.85;margin-bottom:6px;">Username + password only — nothing is mailed to you.</div>
      <input id="fs-user" autocomplete="username" placeholder="Username" style="width:100%;margin-bottom:6px;padding:6px;border-radius:6px;border:1px solid #666;background:#111;color:#fff;">
      <input id="fs-pass" type="password" autocomplete="current-password" placeholder="Password (6+ chars)" style="width:100%;margin-bottom:8px;padding:6px;border-radius:6px;border:1px solid #666;background:#111;color:#fff;">
      <div style="display:flex;gap:6px;">
        <button type="button" id="fs-signup" style="flex:1;background:#1d4ed8;color:#fff;border:0;border-radius:6px;padding:8px;cursor:pointer;">Sign up</button>
        <button type="button" id="fs-signin" style="flex:1;background:#065f46;color:#fff;border:0;border-radius:6px;padding:8px;cursor:pointer;">Sign in</button>
      </div>`;
    document.getElementById('fs-signup').onclick = () => doAuth(true);
    document.getElementById('fs-signin').onclick = () => doAuth(false);
  }

  function out(msg, append = false) {
    const node = document.getElementById('fs-out');
    if (!node) return;
    if (!append) node.innerHTML = '';
    const div = document.createElement('div');
    div.style.marginBottom = '6px';
    div.innerHTML = msg;
    node.appendChild(div);
  }

  function notify(msg, append = false) {
    if (typeof window.showToast === 'function') window.showToast(msg, 4500);
    if (append) out(msg, true);
    else {
      const node = document.getElementById('fs-out');
      if (node) {
        node.innerHTML = '';
        const div = document.createElement('div');
        div.style.marginBottom = '6px';
        div.textContent = msg.replace(/<[^>]+>/g, '');
        node.appendChild(div);
      }
    }
  }

  async function doAuth(signUp) {
    const usernameRaw = document.getElementById('fs-user')?.value?.trim() || '';
    const password = document.getElementById('fs-pass')?.value || '';
    if (!usernameRaw || !password) return out('Enter username and password.');
    if (password.length < 6) return out('Password must be at least 6 characters.');
    let email;
    try {
      email = usernameToEmail(usernameRaw);
    } catch (e) {
      return out(e.message || 'Invalid username.');
    }

    if (signUp) {
      const regRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameRaw,
          password,
          avatar_url: ctx.getAvatar() || ''
        })
      });
      const regJson = await regRes.json().catch(() => ({}));
      if (!regRes.ok) return out(regJson.error || 'Sign up failed.');
      const signed = await state.supabase.auth.signInWithPassword({ email, password });
      if (signed.error) return out(authErrorMessage(signed.error) || 'Signed up but could not log in — try Sign in.');
      state.session = signed.data.session;
    } else {
      const result = await state.supabase.auth.signInWithPassword({ email, password });
      if (result.error) return out(authErrorMessage(result.error));
      state.session = result.data.session;
      await api('/api/profile', {
        method: 'POST',
        body: JSON.stringify({ username: usernameRaw, avatar_url: ctx.getAvatar() || '' })
      });
    }

    await refreshProfile();
  }

  async function refreshProfile() {
    if (!state.session) return;
    try {
      state.profile = await api('/api/profile');
      ctx.setName(state.profile.username);
      if (state.profile.avatar_url) ctx.setAvatar(state.profile.avatar_url);
      renderAuth();
      out(`Authenticated as <b>${state.profile.username}</b>`);
    } catch (e) {
      out(e.message || 'Profile fetch failed.');
    }
  }

  async function showLeaderboard() {
    const players = await api('/api/leaderboard', { headers: {} });
    out('<b>Top Players</b>');
    players.forEach((p, i) => out(`${i + 1}. ${p.username} - <span style="color:#ffd700">${p.total_elo}</span>`, true));
  }

  async function showHistory() {
    if (!state.session) return out('Sign in to view history.');
    const history = await api('/api/history');
    out('<b>Last 20 Games</b>');
    if (!history.length) return out('No games yet.', true);
    history.forEach((m) => {
      const opponent = m.opponent_username || 'Unknown';
      out(`${new Date(m.created_at).toLocaleString()} - vs ${opponent} | ${m.player_score}-${m.opponent_score} | chkobbas: ${m.chkobba_count} | <b>${m.match_result}</b>`, true);
    });
  }

  async function waitForMatch(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const status = await api('/api/matchmaking/status');
      if (status.state === 'matched') return status;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  }

  async function findMatch() {
    if (!state.session || !state.profile) {
      notify('Sign in via Account & stats (bottom-right), then use Find a match again.');
      return;
    }
    window.chkobbaRankedQueueFlow = true;
    window.chkobbaRankedStartEmitted = false;
    if (window.showQueueMatchmakingView) window.showQueueMatchmakingView();

    try {
      if (window.updateQueueMatchmakingStatus) window.updateQueueMatchmakingStatus('Looking for a player…');
      await api('/api/matchmaking/find', { method: 'POST' });
      const found = await waitForMatch(15000);
      if (!found) {
        window.chkobbaRankedQueueFlow = false;
        window.chkobbaRankedStartEmitted = false;
        await api('/api/matchmaking/cancel', { method: 'POST' }).catch(() => {});
        if (window.updateQueueMatchmakingStatus) window.updateQueueMatchmakingStatus('No match — starting vs bot…');
        setTimeout(() => {
          window.startGame('single', ctx.getName(), localStorage.getItem('chkobba_sfx_enabled') !== '0', localStorage.getItem('chkobba_back') || 'back.png', 21, 'medium', '1v1');
          window.showView('view-game');
        }, 500);
        return;
      }

      state.gameSession = found.game_session;
      const socket = ctx.getSocket();
      if (!socket) {
        window.chkobbaRankedQueueFlow = false;
        window.chkobbaRankedStartEmitted = false;
        notify('Connection lost — refresh the page.');
        window.showView('view-lobby');
        return;
      }

      if (found.amHost) {
        if (window.updateQueueMatchmakingStatus) window.updateQueueMatchmakingStatus('Setting up your table…');
        const onPartyCreated = ({ code }) => {
          socket.off('party-created', onPartyCreated);
          api(`/api/game-session/${state.gameSession.id}/attach-room`, {
            method: 'POST',
            body: JSON.stringify({ room_code: code })
          }).catch(() => {});
          if (window.updateQueueMatchmakingStatus) window.updateQueueMatchmakingStatus('Waiting for opponent…');
        };
        socket.on('party-created', onPartyCreated);
        socket.emit('create-party', {
          name: ctx.getName(),
          avatar: ctx.getAvatar(),
          sessionToken: ctx.getToken(),
          userId: state.profile.id
        });
      } else {
        if (window.updateQueueMatchmakingStatus) window.updateQueueMatchmakingStatus('Joining your opponent…');
        for (let i = 0; i < 20; i++) {
          const status = await api('/api/matchmaking/status');
          if (status?.game_session?.room_code) {
            const joinInput = document.getElementById('join-code-input');
            if (joinInput) joinInput.value = status.game_session.room_code;
            socket.emit('join-party', {
              code: status.game_session.room_code,
              name: ctx.getName(),
              avatar: ctx.getAvatar(),
              sessionToken: ctx.getToken(),
              userId: state.profile.id
            });
            return;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
        window.chkobbaRankedQueueFlow = false;
        window.chkobbaRankedStartEmitted = false;
        notify('Could not join host — try again.');
        window.showView('view-lobby');
      }
    } catch (e) {
      window.chkobbaRankedQueueFlow = false;
      window.chkobbaRankedStartEmitted = false;
      out(e.message || 'Matchmaking failed.');
      window.showView('view-lobby');
    }
  }

  async function refreshAll() {
    if (state.session) await refreshProfile();
    await showLeaderboard();
  }

  try {
    const cfg = await (await fetch('/api/config')).json();
    if (!cfg.enabled || !window.supabase?.createClient) return;
    state.supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    state.supabase.auth.onAuthStateChange((_event, sess) => {
      state.session = sess;
      if (!sess) {
        state.profile = null;
        renderAuth();
      }
    });
    const current = await state.supabase.auth.getSession();
    state.session = current.data.session;
    window.chkobbaQueueForMatch = findMatch;
    window.chkobbaCancelRankedMatchmaking = async function () {
      try {
        await api('/api/matchmaking/cancel', { method: 'POST' });
      } catch (_) { /* ignore */ }
    };
    mountPanel();
    renderAuth();
    if (state.session) await refreshProfile();
  } catch (e) {
    // Keep legacy frontend running even if Supabase is not configured.
  }
})();
