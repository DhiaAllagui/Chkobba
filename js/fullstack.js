(async function initFullstackFeatures() {
  const state = {
    supabase: null,
    session: null,
    profile: null,
    gameSession: null,
    queuePolling: null,
    isEditingProfile: false,
    isChangingPassword: false
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
    // Inject into the new view-account slot
    const target = document.getElementById('account-panel-slot');
    if (!target) return;

    const panel = el('div', { id: 'fullstack-panel' });
    panel.style.cssText = [
      'width:100%',
      'background:linear-gradient(135deg, rgba(201,168,76,0.08), rgba(201,168,76,0.03))',
      'backdrop-filter: blur(12px)',
      'WebkitBackdropFilter: blur(12px)',
      'border:1px solid rgba(212,175,55,0.3)',
      'box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1), 0 8px 32px rgba(0,0,0,0.5)',
      'border-radius:14px',
      'padding:28px 30px',
      'min-height: 250px',
      'color:var(--parchment,#f5e6c8)',
      'font-family:"Cinzel",serif',
      'box-sizing:border-box'
    ].join(';');

    panel.innerHTML = `
      <div style="display:flex;justify-content:center;align-items:center;margin-bottom:20px;">
        <span data-i18n="rankedAcc" style="color:var(--gold,#c9a84c);font-size:14px;letter-spacing:4px;text-transform:uppercase;">Ranked Account</span>
      </div>
      <div id="fs-auth"></div>
      <div id="fs-out" style="max-height:120px;overflow:auto;margin-top:10px;font-size:12px;font-family:'Crimson Pro',serif;color:var(--gold-dim,rgba(201,168,76,0.75));letter-spacing:0.5px;"></div>
    `;

    target.appendChild(panel);
  }

  function renderAuth() {
    const node = document.getElementById('fs-auth');
    if (!node) return;

    const inputStyle = [
      'width:100%', 'margin-bottom:8px', 'padding:8px 10px',
      'border-radius:8px', 'border:1px solid rgba(201,168,76,0.3)',
      'background:rgba(0,0,0,0.35)', 'color:var(--parchment,#f5e6c8)',
      'font-family:\'Crimson Pro\',serif', 'font-size:14px', 'box-sizing:border-box'
    ].join(';');

    if (!state.supabase) {
      const missing = state.configError ? state.configError.join(', ') : 'SUPABASE_URL';
      node.innerHTML = `
        <div style="padding:15px; background:rgba(127,29,29,0.2); border:1px solid rgba(239,68,68,0.3); border-radius:8px; color:#fca5a5; font-family:'Crimson Pro',serif; font-size:13px; text-align:center;">
          <div style="font-weight:bold; margin-bottom:6px; color:#ef4444;">⚠️ CONFIGURATION MISSING</div>
          The following environment variables are missing on Render: <br>
          <code style="display:block; background:#000; padding:4px; margin-top:8px; border-radius:4px; color:#fff; font-size:10px;">${missing}</h2>
          <p style="font-size:11px; margin-top:10px; opacity:0.8;">Make sure to add them in your Render Dashboard settings.</p>
        </div>
      `;
      return;
    }

    if (state.profile) {
      const avatarUrl = state.profile.avatar_url || ctx.getAvatar() || 'img/avatar1.png';
      
      let html = `
        <div style="display:flex;align-items:center;gap:15px;margin-bottom:15px;padding-bottom:18px;border-bottom:1px solid rgba(201,168,76,0.15);">
          <div style="position:relative;width:80px;height:80px;border-radius:50%;border:3px solid var(--gold,#c9a84c);overflow:hidden;background:rgba(0,0,0,0.5);flex-shrink:0;">
            <img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;">
          </div>
          <div style="flex:1;">
            <div style="color:var(--gold,#c9a84c);font-size:22px;font-weight:700;letter-spacing:1px;line-height:1.2;">${escapeHtml(state.profile.username)}</div>
            <div style="cursor:pointer; display:inline-block; color:var(--parchment,#f5e6c8);opacity:0.75;font-size:14px;margin-top:4px;font-family:'Crimson Pro',serif;transition:0.2s;" onclick="if(window.fsShowLeaderboard) { window.fsShowLeaderboard(); window.showView('view-leaderboard'); }" onmouseover="this.style.opacity='1'; this.style.textShadow='0 0 5px rgba(255,255,255,0.5)';" onmouseout="this.style.opacity='0.75'; this.style.textShadow='none';"><span data-i18n="eloLabel">ELO RATING:</span> <b style="color:var(--gold,#c9a84c);opacity:1;">${state.profile.total_elo}</b></div>
            <br>
            ${(state.currentWinStreak >= 3) ? `<div style="cursor:pointer; display:inline-block; margin-top:8px; background:rgba(201,168,76,0.2); border:1px solid var(--gold); border-radius:4px; padding:4px 8px; font-size:11px; font-family:'Cinzel',serif; color:var(--gold); animation: pulseGlow 1.5s infinite alternate; transition:0.2s;" onclick="if(window.fsShowHistory) { window.fsShowHistory(); window.showView('view-history'); }" onmouseover="this.style.background='rgba(201,168,76,0.4)'" onmouseout="this.style.background='rgba(201,168,76,0.2)'">🔥 <span data-i18n="streakBadge">STREAK:</span> ${state.currentWinStreak} <span data-i18n="winsLabel">WINS</span></div>` : ''}
          </div>
        </div>
      `;

      if (state.isEditingProfile) {
        html += `
          <div style="margin-bottom:12px;">
            <label data-i18n="lblChangeUser" style="display:block;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--gold-dim);margin-bottom:4px;">Change Username</label>
            <input id="fs-edit-user" value="${escapeHtml(state.profile.username)}" style="${inputStyle}">
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button id="fs-save-profile" data-i18n="btnSave" style="flex:1;background:rgba(6,95,70,0.5);color:#6ee7b7;border:1px solid rgba(52,211,153,0.35);border-radius:8px;padding:6px;cursor:pointer;font-family:'Cinzel',serif;font-size:10px;">Save</button>
              <button id="fs-cancel-edit" data-i18n="btnCancel" style="background:rgba(0,0,0,0.3);color:var(--parchment);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px 12px;cursor:pointer;font-family:'Cinzel',serif;font-size:10px;">Cancel</button>
            </div>
          </div>
        `;
      } else if (state.isChangingPassword) {
        html += `
          <div style="margin-bottom:12px;">
            <label data-i18n="lblNewPass" style="display:block;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--gold-dim);margin-bottom:4px;">New Password</label>
            <input id="fs-new-pass" type="password" placeholder="6+ characters" style="${inputStyle}">
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button id="fs-save-pass" data-i18n="btnUpdatePass" style="flex:1;background:rgba(29,78,216,0.5);color:#bfdbfe;border:1px solid rgba(96,165,250,0.35);border-radius:8px;padding:6px;cursor:pointer;font-family:'Cinzel',serif;font-size:10px;">Update Password</button>
              <button id="fs-cancel-pass" data-i18n="btnCancel" style="background:rgba(0,0,0,0.3);color:var(--parchment);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px 12px;cursor:pointer;font-family:'Cinzel',serif;font-size:10px;">Cancel</button>
            </div>
          </div>
        `;
      } else {
        html += `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;margin-top:12px;">
            <button id="fs-btn-edit" style="display:flex;align-items:center;justify-content:center;gap:6px;background:rgba(255,255,255,0.05);color:var(--parchment);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:10px;cursor:pointer;font-family:'Cinzel',serif;font-size:12px;transition:0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'"><img src="/img/edit.png" style="width:16px;object-fit:contain;"> <span data-i18n="btnEditProf">Edit Profile</span></button>
            <button id="fs-btn-pass" style="display:flex;align-items:center;justify-content:center;gap:6px;background:rgba(255,255,255,0.05);color:var(--parchment);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:10px;cursor:pointer;font-family:'Cinzel',serif;font-size:12px;transition:0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'"><img src="/img/security.png" style="width:16px;object-fit:contain;"> <span data-i18n="btnPassSec">Security</span></button>
          </div>
          <button id="fs-logout" data-i18n="btnSignOut" type="button" style="width:100%;background:rgba(127,29,29,0.5);color:#fca5a5;border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:8px;cursor:pointer;font-family:'Cinzel',serif;font-size:11px;letter-spacing:1px;transition:all 0.2s;">Sign Out</button>
        `;
      }

      node.innerHTML = html;

      // Event listeners for logged-in view
      const btnLogout = document.getElementById('fs-logout');
      if (btnLogout) btnLogout.onclick = async () => {
        await state.supabase.auth.signOut();
        state.session = null; state.profile = null;
        renderAuth();
      };

      const btnEdit = document.getElementById('fs-btn-edit');
      if (btnEdit) btnEdit.onclick = () => { state.isEditingProfile = true; renderAuth(); };
      
      const btnCancelEdit = document.getElementById('fs-cancel-edit');
      if (btnCancelEdit) btnCancelEdit.onclick = () => { state.isEditingProfile = false; renderAuth(); };

      const btnSaveProfile = document.getElementById('fs-save-profile');
      if (btnSaveProfile) btnSaveProfile.onclick = doUpdateProfile;

      const btnPass = document.getElementById('fs-btn-pass');
      if (btnPass) btnPass.onclick = () => { state.isChangingPassword = true; renderAuth(); };

      const btnCancelPass = document.getElementById('fs-cancel-pass');
      if (btnCancelPass) btnCancelPass.onclick = () => { state.isChangingPassword = false; renderAuth(); };

      const btnSavePass = document.getElementById('fs-save-pass');
      if (btnSavePass) btnSavePass.onclick = doUpdatePassword;

      if (window.changeLanguage && window.currentLang) window.changeLanguage(window.currentLang);
      return;
    }

    node.innerHTML = `
      <div data-i18n="authDesc" style="font-size:11px;color:rgba(201,168,76,0.6);margin-bottom:10px;font-family:'Crimson Pro',serif;letter-spacing:0.5px;">Sign in for ranked matchmaking — no email needed.</div>
      <input id="fs-user" autocomplete="username" placeholder="Username" data-i18n="phUser" style="${inputStyle}">
      <input id="fs-pass" type="password" autocomplete="current-password" placeholder="Password (6+ chars)" data-i18n="phPass" style="${inputStyle}">
      <div style="display:flex;gap:8px;margin-top:2px;">
        <button type="button" id="fs-signup" data-i18n="signUpBtn" style="flex:1;background:rgba(29,78,216,0.5);color:#bfdbfe;border:1px solid rgba(96,165,250,0.35);border-radius:8px;padding:8px;cursor:pointer;font-family:'Cinzel',serif;font-size:11px;letter-spacing:1px;transition:all 0.2s;" onmouseover="this.style.background='rgba(29,78,216,0.7)'" onmouseout="this.style.background='rgba(29,78,216,0.5)'">Sign Up</button>
        <button type="button" id="fs-signin" data-i18n="signInBtn" style="flex:1;background:rgba(6,95,70,0.5);color:#6ee7b7;border:1px solid rgba(52,211,153,0.35);border-radius:8px;padding:8px;cursor:pointer;font-family:'Cinzel',serif;font-size:11px;letter-spacing:1px;transition:all 0.2s;" onmouseover="this.style.background='rgba(6,95,70,0.7)'" onmouseout="this.style.background='rgba(6,95,70,0.5)'">Sign In</button>
      </div>`;
    document.getElementById('fs-signup').onclick = () => doAuth(true);
    document.getElementById('fs-signin').onclick = () => doAuth(false);
    if (window.changeLanguage && window.currentLang) window.changeLanguage(window.currentLang);
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

    if (window.showGlobalLoader) window.showGlobalLoader(signUp ? "Creating Account..." : "Signing In...");

    try {
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
        if (!regRes.ok) throw new Error(regJson.error || 'Sign up failed.');
        const signed = await state.supabase.auth.signInWithPassword({ email, password });
        if (signed.error) throw new Error(authErrorMessage(signed.error) || 'Signed up but could not log in — try Sign in.');
        state.session = signed.data.session;
      } else {
        const result = await state.supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw new Error(authErrorMessage(result.error));
        state.session = result.data.session;
        await api('/api/profile', {
          method: 'POST',
          body: JSON.stringify({ username: usernameRaw, avatar_url: ctx.getAvatar() || '' })
        });
      }

      await refreshProfile();
    } catch (e) {
      out(e.message || 'Authentication failed.');
    } finally {
      if (window.hideGlobalLoader) window.hideGlobalLoader();
    }
  }

  async function doUpdateProfile() {
    const newUsername = document.getElementById('fs-edit-user')?.value?.trim() || '';
    if (newUsername.length < 3 || newUsername.length > 32) return out('Use 3–32 characters.');
    
    if (window.showGlobalLoader) window.showGlobalLoader("Saving Profile...");
    try {
      await api('/api/profile', {
        method: 'POST',
        body: JSON.stringify({ 
          username: newUsername, 
          avatar_url: ctx.getAvatar() || state.profile?.avatar_url || '' 
        })
      });
      state.isEditingProfile = false;
      await refreshProfile();
      notify('Profile updated successfully!');
    } catch (e) {
      out(e.message || 'Update failed.');
    } finally {
      if (window.hideGlobalLoader) window.hideGlobalLoader();
    }
  }

  async function doUpdatePassword() {
    const newPass = document.getElementById('fs-new-pass')?.value || '';
    if (newPass.length < 6) return out('Password must be 6+ chars.');

    if (window.showGlobalLoader) window.showGlobalLoader("Updating Password...");
    try {
      const { error } = await state.supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      state.isChangingPassword = false;
      renderAuth();
      notify('Password updated success!');
    } catch (e) {
      out(e.message || 'Security update failed.');
    } finally {
      if (window.hideGlobalLoader) window.hideGlobalLoader();
    }
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

  function lbOut(html, append = false) {
    const node = document.getElementById('leaderboard-out');
    if (!node) return;
    if (!append) node.innerHTML = '';
    const div = document.createElement('div');
    div.style.marginBottom = '5px';
    div.innerHTML = html;
    node.appendChild(div);
  }

  function histOut(html, append = false) {
    const node = document.getElementById('history-out');
    if (!node) return;
    if (!append) node.innerHTML = '';
    const div = document.createElement('div');
    div.style.marginBottom = '5px';
    div.innerHTML = html;
    node.appendChild(div);
  }

  async function showLeaderboard() {
    if (window.showGlobalLoader) window.showGlobalLoader("Fetching Leaders...");
    try {
      const players = await api('/api/leaderboard', { headers: {} });
      lbOut('<b data-i18n="lbTitle" style="color:var(--gold,#c9a84c);letter-spacing:2px;display:block;margin-bottom:12px;">🏆 TOP PLAYERS</b>');
      players.forEach((p, i) => {
        const isMe = state.profile && state.profile.id === p.id;
        let borderCol = 'rgba(255,255,255,0.05)';
        let rankIconHTML = `<div style="width:24px; text-align:center; font-weight:bold; color:var(--parchment); opacity:0.6;">${i + 1}</div>`;
        
        if (i === 0) { borderCol = '#fbbf24'; rankIconHTML = '<img src="/img/first.png" style="width:24px;height:24px;">'; }
        else if (i === 1) { borderCol = '#9ca3af'; rankIconHTML = '<img src="/img/second.png" style="width:24px;height:24px;">'; }
        else if (i === 2) { borderCol = '#b45309'; rankIconHTML = '<img src="/img/third.png" style="width:24px;height:24px;">'; }

        const myHighlight = isMe ? 'background: rgba(201,168,76,0.15); box-shadow: 0 0 10px rgba(201,168,76,0.3); border-color: rgba(201,168,76,0.8);' : '';
        const myBadge = isMe ? '<span data-i18n="youBadge" style="font-size:9px; background:var(--gold); color:#000; padding:1px 4px; border-radius:3px; margin-left:6px; font-weight:bold;">YOU</span>' : '';

        const cardH = `
          <div style="display:flex; align-items:center; background: rgba(0,0,0,0.4); border: 1px solid ${borderCol}; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; gap: 12px; ${myHighlight}">
            <div style="display:flex; justify-content:center; align-items:center; min-width:30px;">
              ${rankIconHTML}
            </div>
            <div style="flex:1;">
              <div style="font-size:15px; font-weight:bold; color:var(--parchment);">${escapeHtml(p.username)} ${myBadge}</div>
            </div>
            <div style="text-align:right;">
               <div style="color:var(--gold); font-family:'Cinzel',serif; font-size:16px;">${p.total_elo}</div>
               <div data-i18n="eloPoints" style="font-size:10px; color:rgba(255,255,255,0.5); text-transform:uppercase;">Elo points</div>
            </div>
          </div>
        `;
        lbOut(cardH, true);
      });
      if (window.changeLanguage && window.currentLang) window.changeLanguage(window.currentLang);
    } catch (e) {
      lbOut(e.message || 'Failed to load leaderboard.');
    } finally {
      if (window.hideGlobalLoader) window.hideGlobalLoader();
    }
  }

  async function showHistory() {
    if (!state.session) {
      histOut('Sign in to view history.');
      return;
    }
    if (window.showGlobalLoader) window.showGlobalLoader("Loading History...");
    try {
      const history = await api('/api/history');
      if (!history.length) {
        histOut('No games recorded yet.', true);
        return;
      }
      // Compute current winning streak from history
      let currentStreak = 0;
      for (const m of history) {
        if (m.match_result === 'win') currentStreak++;
        else break;
      }
      state.currentWinStreak = currentStreak;

      histOut('<b data-i18n="histTitle2" style="color:var(--gold,#c9a84c);letter-spacing:2px;display:block;margin-bottom:12px;">📜 RECENT MATCHES</b>');

      // Streak Banner at the top
      if (currentStreak >= 3) {
        histOut(`
          <div style="background: linear-gradient(90deg, rgba(201,168,76,0.15), rgba(201,168,76,0.05)); border-left: 4px solid var(--gold); border-radius: 6px; padding: 12px; margin-bottom: 16px; animation: pulseGlow 2s infinite alternate;">
            <strong style="color: var(--gold); font-family: 'Cinzel', serif; letter-spacing: 1px;">🔥 <span data-i18n="streakWinMsg">YOU ARE ON A WINNING STREAK:</span> ${currentStreak} <span data-i18n="streakWinMsg2">GAMES NO LOSS! KEEP IT UP!</span></strong>
          </div>
        `, true);
      }

      // History Cards
      history.forEach((m) => {
        const opponent = m.opponent_username || 'Unknown';
        const isWin = m.match_result === 'win';
        const resultColor = isWin ? '#5eead4' : '#fda4af';
        const resultText = m.match_result.toUpperCase();
        
        const cardHTML = `
          <div style="display:flex; align-items:center; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 12px; margin-bottom: 8px; gap: 16px;">
            <div style="font-weight: 900; font-size: 18px; color: ${resultColor}; letter-spacing: 2px; text-shadow: 0 0 8px ${isWin ? 'rgba(94,234,212,0.4)' : 'rgba(253,164,175,0.4)'}; min-width: 65px;">
              ${resultText}
            </div>
            
            <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center;">
              <div style="font-size: 14px; font-weight: bold; color: var(--parchment); margin-bottom: 4px;"><span data-i18n="vsText">vs</span> ${escapeHtml(opponent)}</div>
              <div style="color: var(--gold); font-family: 'Cinzel', serif; font-size: 16px;">${m.player_score} - ${m.opponent_score}</div>
            </div>
            
            <div style="text-align:right; font-size: 11px; opacity: 0.6; display:flex; flex-direction:column; align-items:flex-end;">
              <div>${new Date(m.created_at).toLocaleDateString()}</div>
              <div><span data-i18n="chkobbasName">Chkobbas</span>: <strong style="color:#fff">${m.chkobba_count}</strong></div>
            </div>
          </div>
        `;
        histOut(cardHTML, true);
      });
      renderAuth(); // Update the profile UI with the freshly computed streak badge
      if (window.changeLanguage && window.currentLang) window.changeLanguage(window.currentLang);
    } catch (e) {
      histOut(e.message || 'Failed to load history.');
    } finally {
      if (window.hideGlobalLoader) window.hideGlobalLoader();
    }
  }

  async function waitForMatch(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // Abort gracefully if user canceled the queue
      if (!window.chkobbaRankedQueueFlow) return null;

      const status = await api('/api/matchmaking/status');
      if (status.state === 'matched') return status;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  }

  async function findMatch() {
    if (!state.session || !state.profile) {
      notify('Sign in first, then try again.');
      return;
    }
    window.chkobbaRankedQueueFlow = true;
    window.chkobbaRankedStartEmitted = false;
    if (window.showQueueMatchmakingView) window.showQueueMatchmakingView();

    try {
      if (window.updateQueueMatchmakingStatus) window.updateQueueMatchmakingStatus('Looking for a player…');
      await api('/api/matchmaking/find', { method: 'POST' });
      const found = await waitForMatch(15000);
      // If the user manually hit cancel during the find or wait phase, 
      // the flow was aborted. We MUST send another cancel request 
      // in case the find request resolved *after* the UI cancel request.
      if (!window.chkobbaRankedQueueFlow) {
        api('/api/matchmaking/cancel', { method: 'POST' }).catch(() => {});
        return;
      }

      if (!found) {
        window.chkobbaRankedQueueFlow = false;
        window.chkobbaRankedStartEmitted = false;
        await api('/api/matchmaking/cancel', { method: 'POST' }).catch(() => {});
        
        // Show clear feedback on the queue screen instead of a sudden jump
        if (window.updateQueueMatchmakingStatus) {
           window.updateQueueMatchmakingStatus('No opponents found right now. Returning to lobby…');
        }
        
        // Short delay so user can read the message
        await new Promise(r => setTimeout(r, 3500));

        if (window.showView) window.showView('view-lobby');
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
    
    // Always assign these so the UI buttons don't crash or show generic errors
    window.fsShowLeaderboard = async () => {
      if (!cfg.enabled) {
        window.showToast("Leaderboard is unavailable: Server is missing " + (cfg.missingEnv || []).join(', '), 5000);
        return;
      }
      await showLeaderboard();
    };

    window.fsShowHistory = async () => {
      if (!cfg.enabled) {
        window.showToast("Match History is unavailable: Server is missing " + (cfg.missingEnv || []).join(', '), 5000);
        return;
      }
      await showHistory();
    };

    window.chkobbaQueueForMatch = async () => {
      if (!cfg.enabled) {
        window.showToast("Ranked Queue is unavailable: Server is missing " + (cfg.missingEnv || []).join(', '), 5000);
        return;
      }
      await findMatch();
    };

    window.recordBotWinReward = async (difficulty) => {
      if (!cfg.enabled || !state.session) return;
      try {
        const res = await api('/api/match/bot-win', {
          method: 'POST',
          body: JSON.stringify({ difficulty, player_won: true })
        });
        if (res.ok) {
          if (typeof window.showToast === 'function') window.showToast("PATRON DEFEATED: +1 RANKED POINT!", 5000);
          await refreshProfile();
        }
      } catch (e) {
        console.warn("Elo update failed:", e);
      }
    };

    if (cfg.enabled && window.supabase?.createClient) {
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
      if (state.session) await refreshProfile();
    } else {
      console.warn("[CHKOBBA] Supabase features disabled. Missing:", cfg.missingEnv);
      state.configError = cfg.missingEnv;
    }

    window.chkobbaCancelRankedMatchmaking = async function () {
      try {
        await api('/api/matchmaking/cancel', { method: 'POST' });
      } catch (_) { /* ignore */ }
    };
    mountPanel();
    renderAuth();
  } catch (e) {
    // Keep legacy frontend running even if Supabase is not configured.
  }
})();
