const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

// Utility for game logic

// ----- Static assets -----
// Serve pages folder at root, and root folder for css/js/img etc.
app.use(express.static(path.join(__dirname, 'pages')));
app.use('/css',    express.static(path.join(__dirname, 'css')));
app.use('/js',     express.static(path.join(__dirname, 'js')));
app.use('/img',    express.static(path.join(__dirname, 'img')));
app.use('/cards',         express.static(path.join(__dirname, 'cards')));
app.use('/assets/cards',  express.static(path.join(__dirname, 'cards')));
app.use('/sound',         express.static(path.join(__dirname, 'sound')));
app.use('/pfp',    express.static(path.join(__dirname, 'pfp')));
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

function mapSupabaseSetupError(err) {
  const m = err?.message || String(err);
  if (/schema cache|relation .* does not exist|Could not find the table/i.test(m)) {
    return 'Database tables are missing. In Supabase open SQL Editor, paste the contents of supabase-schema.sql from this project, then click Run.';
  }
  return m;
}

/** Internal auth id only (Supabase requires an email field in auth.users — never shown to players). */
function usernameToGameEmail(username) {
  const slug = (username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (slug.length < 3 || slug.length > 32) {
    throw new Error('Username must be 3–32 characters (letters, numbers, underscore).');
  }
  return `${slug}@chkobba.game`;
}

// SPA Routes
app.get(['/', '/menu.html', '/lobby.html', '/chkobba.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'index.html'));
});

// ----- In-memory room store -----
const rooms = {};
const rankedRoomByCode = {};
const ELO_WIN_DELTA = 20;
const ELO_LOSS_DELTA = 15;

async function authRequired(req, res, next) {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase is not configured on server.' });
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token.' });
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired token.' });
  req.user = data.user;
  next();
}

async function applyMatchResult({ winnerId, loserId, gameSessionId, endedReason, winnerScore, loserScore, winnerChkobbas, loserChkobbas }) {
  if (!supabaseAdmin || !winnerId || !loserId || winnerId === loserId) return;

  const { data: profiles, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('id,total_elo')
    .in('id', [winnerId, loserId]);
  if (profErr || !profiles || profiles.length < 2) return;

  const winP = profiles.find((p) => p.id === winnerId);
  const loseP = profiles.find((p) => p.id === loserId);
  if (!winP || !loseP) return;

  const winnerElo = (winP.total_elo || 1000) + ELO_WIN_DELTA;
  const loserElo = Math.max(100, (loseP.total_elo || 1000) - ELO_LOSS_DELTA);

  await supabaseAdmin.from('profiles').update({ total_elo: winnerElo, updated_at: new Date().toISOString() }).eq('id', winnerId);
  await supabaseAdmin.from('profiles').update({ total_elo: loserElo, updated_at: new Date().toISOString() }).eq('id', loserId);

  await supabaseAdmin.from('game_sessions').update({
    status: 'finished',
    winner_id: winnerId,
    loser_id: loserId,
    ended_reason: endedReason || 'normal',
    ended_at: new Date().toISOString()
  }).eq('id', gameSessionId).neq('status', 'finished');

  const { data: playerNames } = await supabaseAdmin.from('profiles').select('id').in('id', [winnerId, loserId]);
  if (!playerNames || playerNames.length < 2) return;

  await supabaseAdmin.from('match_history').insert([
    {
      game_session_id: gameSessionId || null,
      player_id: winnerId,
      opponent_id: loserId,
      player_score: winnerScore,
      opponent_score: loserScore,
      chkobba_count: winnerChkobbas || 0,
      match_result: 'win'
    },
    {
      game_session_id: gameSessionId || null,
      player_id: loserId,
      opponent_id: winnerId,
      player_score: loserScore,
      opponent_score: winnerScore,
      chkobba_count: loserChkobbas || 0,
      match_result: 'loss'
    }
  ]);

  // Cleanup old games beyond the 20 limits
  async function trimHistory(pid) {
    if (!pid) return;
    const { data: records } = await supabaseAdmin.from('match_history')
      .select('match_id')
      .eq('player_id', pid)
      .order('created_at', { ascending: false });
    if (records && records.length > 20) {
      const toDelete = records.slice(20).map(r => r.match_id);
      await supabaseAdmin.from('match_history').delete().in('match_id', toDelete);
    }
  }
  await trimHistory(winnerId);
  await trimHistory(loserId);
}

function generateCode() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `CK-${n}`;
}

// Backend Deck Generation
function generateDeck() {
  const suits = ['carreau', 'coeur', 'trefel', 'pique'];
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  let deck = [];
  suits.forEach(suit => {
    values.forEach(v => {
      deck.push({ id: `${v}${suit}`, suit: suit, value: v, is7ayya: (v === 7 && suit === 'carreau') });
    });
  });
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Server-Side Game Rules
function calculateScore(pile) {
  const cards = pile.length;
  const dineri = pile.filter(c => c.suit === 'carreau').length;
  const sab3a = pile.some(c => c.is7ayya);
  const sevens = pile.filter(c => c.value === 7).length;
  const sixes = pile.filter(c => c.value === 6).length;
  return { cards, dineri, sab3a, sevens, sixes };
}

function _calcBarmila(s0, s1) {
  if (s0.sevens > s1.sevens) return 0;
  if (s1.sevens > s0.sevens) return 1;
  if (s0.sixes > s1.sixes) return 0;
  if (s1.sixes > s0.sixes) return 1;
  return -1;
}

function calculateRoundPoints(state) {
  const s0 = calculateScore(state.piles[0]);
  const s1 = calculateScore(state.piles[1]);

  // --- KAMYOUN CHECK ---
  const isKamyoun0 = s0.dineri === 10;
  const isKamyoun1 = s1.dineri === 10;
  const isKamyoun = isKamyoun0 || isKamyoun1;

  const pts = [0, 0];

  if (s0.cards > s1.cards) pts[0]++;
  else if (s1.cards > s0.cards) pts[1]++;

  if (s0.dineri > s1.dineri) pts[0]++;
  else if (s1.dineri > s0.dineri) pts[1]++;

  if (s0.sab3a) pts[0]++;
  else if (s1.sab3a) pts[1]++;

  const barmila = _calcBarmila(s0, s1);
  if (barmila === 0) pts[0]++;
  else if (barmila === 1) pts[1]++;

  pts[0] += state.chkobbas[0].length;
  pts[1] += state.chkobbas[1].length;

  return {
    pts, s0, s1,
    carta:  s0.cards > s1.cards ? 0 : (s1.cards > s0.cards ? 1 : -1),
    dineri: s0.dineri > s1.dineri ? 0 : (s1.dineri > s0.dineri ? 1 : -1),
    sab3a:  s0.sab3a ? 0 : (s1.sab3a ? 1 : -1),
    barmila,
    chkobba0: state.chkobbas[0].length,
    chkobba1: state.chkobbas[1].length,
    isKamyoun,
    kamyounWinner: isKamyoun0 ? 0 : (isKamyoun1 ? 1 : -1)
  };
}

app.get('/api/config', (req, res) => {
  const missingEnv = [
    !SUPABASE_URL && 'SUPABASE_URL',
    !SUPABASE_ANON_KEY && 'SUPABASE_ANON_KEY',
    !SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY'
  ].filter(Boolean);
  res.json({
    supabaseUrl: SUPABASE_URL || '',
    supabaseAnonKey: SUPABASE_ANON_KEY || '',
    enabled: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
    missingEnv
  });
});

/** Sign-up without client-side auth.signUp — no confirmation emails, no email rate limits. */
app.post('/api/auth/register', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Server not configured.' });
  const usernameRaw = (req.body?.username || '').trim();
  const password = req.body?.password || '';
  const avatarUrl = (req.body?.avatar_url || '').trim();
  if (!usernameRaw || password.length < 6) {
    return res.status(400).json({ error: 'Username and password (6+ characters) required.' });
  }
  let email;
  try {
    email = usernameToGameEmail(usernameRaw);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: usernameRaw }
  });
  if (cErr) {
    const msg = cErr.message || '';
    if (/already|exists|registered|duplicate/i.test(msg)) {
      return res.status(400).json({ error: 'That username is already taken.' });
    }
    return res.status(400).json({ error: mapSupabaseSetupError(cErr) });
  }
  const uid = created.user.id;
  const { error: pErr } = await supabaseAdmin.from('profiles').upsert({
    id: uid,
    username: usernameRaw,
    email,
    avatar_url: avatarUrl,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (pErr) return res.status(400).json({ error: mapSupabaseSetupError(pErr) });
  res.json({ ok: true });
});

app.get('/api/profile', authRequired, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id,username,email,avatar_url,total_elo,created_at,updated_at')
    .eq('id', req.user.id)
    .maybeSingle();
  if (error) return res.status(400).json({ error: mapSupabaseSetupError(error) });
  if (!data) return res.status(404).json({ error: 'Profile not found.' });
  res.json(data);
});

app.post('/api/profile', authRequired, async (req, res) => {
  const username = (req.body?.username || '').trim();
  const avatarUrl = (req.body?.avatar_url || '').trim();
  if (!username) return res.status(400).json({ error: 'username is required.' });
  const payload = {
    id: req.user.id,
    username,
    email: req.user.email || '',
    avatar_url: avatarUrl,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select('id,username,email,avatar_url,total_elo,updated_at')
    .single();
  if (error) return res.status(400).json({ error: mapSupabaseSetupError(error) });
  res.json(data);
});

app.post('/api/matchmaking/find', authRequired, async (req, res) => {
  const me = req.user.id;
  const nowIso = new Date().toISOString();
  await supabaseAdmin.from('waiting_players').update({ status: 'expired', updated_at: nowIso })
    .eq('status', 'waiting').lt('created_at', new Date(Date.now() - 60000).toISOString());

  const { data: existingMatch } = await supabaseAdmin.from('game_sessions')
    .select('id,player1_id,player2_id,status,room_code,created_at')
    .or(`player1_id.eq.${me},player2_id.eq.${me}`)
    .in('status', ['matched', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingMatch) return res.json({ state: 'matched', game_session: existingMatch, amHost: existingMatch.player1_id === me });

  const { data: candidate } = await supabaseAdmin.from('waiting_players')
    .select('id,player_id,created_at')
    .eq('status', 'waiting')
    .neq('player_id', me)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!candidate) {
    const { data: existingWait } = await supabaseAdmin.from('waiting_players')
      .select('id')
      .eq('player_id', me)
      .eq('status', 'waiting')
      .limit(1)
      .maybeSingle();
    if (!existingWait) {
      await supabaseAdmin.from('waiting_players').insert({ player_id: me, status: 'waiting' });
    }
    return res.json({ state: 'waiting' });
  }

  const { data: session, error: sessionErr } = await supabaseAdmin.from('game_sessions')
    .insert({ player1_id: candidate.player_id, player2_id: me, status: 'matched' })
    .select('id,player1_id,player2_id,status,room_code,created_at')
    .single();
  if (sessionErr) return res.status(400).json({ error: mapSupabaseSetupError(sessionErr) });

  await supabaseAdmin.from('waiting_players').update({ status: 'matched', game_session_id: session.id, updated_at: nowIso }).in('id', [candidate.id]);
  await supabaseAdmin.from('waiting_players').update({ status: 'matched', game_session_id: session.id, updated_at: nowIso }).eq('player_id', me).eq('status', 'waiting');
  return res.json({ state: 'matched', game_session: session, amHost: false });
});

app.post('/api/matchmaking/cancel', authRequired, async (req, res) => {
  await supabaseAdmin.from('waiting_players').update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('player_id', req.user.id).eq('status', 'waiting');
  res.json({ ok: true });
});

app.get('/api/matchmaking/status', authRequired, async (req, res) => {
  const me = req.user.id;
  const { data: match } = await supabaseAdmin.from('game_sessions')
    .select('id,player1_id,player2_id,status,room_code,created_at')
    .or(`player1_id.eq.${me},player2_id.eq.${me}`)
    .in('status', ['matched', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (match) return res.json({ state: 'matched', game_session: match, amHost: match.player1_id === me });
  const { data: waiting } = await supabaseAdmin.from('waiting_players')
    .select('id,status,created_at')
    .eq('player_id', me)
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (waiting) return res.json({ state: 'waiting' });
  return res.json({ state: 'idle' });
});

app.get('/api/leaderboard', async (req, res) => {
  if (!supabaseAdmin) return res.json([]);
  const { data, error } = await supabaseAdmin.from('profiles')
    .select('id,username,avatar_url,total_elo')
    .order('total_elo', { ascending: false })
    .limit(20);
  if (error) return res.status(400).json({ error: mapSupabaseSetupError(error) });
  res.json(data || []);
});

app.get('/api/history', authRequired, async (req, res) => {
  const { data: rows, error } = await supabaseAdmin.from('match_history')
    .select('match_id,player_id,opponent_id,player_score,opponent_score,chkobba_count,match_result,created_at')
    .eq('player_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return res.status(400).json({ error: mapSupabaseSetupError(error) });
  const ids = [...new Set((rows || []).map((r) => r.opponent_id))];
  const names = {};
  if (ids.length) {
    const { data: profs } = await supabaseAdmin.from('profiles').select('id,username').in('id', ids);
    (profs || []).forEach((p) => { names[p.id] = p.username; });
  }
  res.json((rows || []).map((r) => ({ ...r, opponent_username: names[r.opponent_id] || 'Unknown' })));
});

app.post('/api/game-session/:id/attach-room', authRequired, async (req, res) => {
  const sessionId = req.params.id;
  const roomCode = (req.body?.room_code || '').trim();
  if (!roomCode) return res.status(400).json({ error: 'room_code is required.' });
  const { data: session, error } = await supabaseAdmin.from('game_sessions')
    .select('id,player1_id,player2_id,status')
    .eq('id', sessionId)
    .single();
  if (error || !session) return res.status(404).json({ error: 'session not found.' });
  if (session.player1_id !== req.user.id) return res.status(403).json({ error: 'Only host can attach room.' });
  await supabaseAdmin.from('game_sessions').update({ room_code: roomCode, status: 'in_progress' }).eq('id', sessionId);
  rankedRoomByCode[roomCode] = { sessionId, player1Id: session.player1_id, player2Id: session.player2_id, finished: false };
  res.json({ ok: true });
});

app.post('/api/match/finish', authRequired, async (req, res) => {
  const { game_session_id, opponent_id, player_score, opponent_score, chkobba_count } = req.body || {};
  if (!game_session_id || !opponent_id) return res.status(400).json({ error: 'game_session_id and opponent_id are required.' });
  const pScore = Number.isInteger(player_score) ? player_score : -1;
  const oScore = Number.isInteger(opponent_score) ? opponent_score : -1;
  if (pScore < 0 || oScore < 0 || pScore === oScore) return res.status(400).json({ error: 'Invalid scores.' });
  const winnerId = pScore > oScore ? req.user.id : opponent_id;
  const loserId = pScore > oScore ? opponent_id : req.user.id;
  await applyMatchResult({
    winnerId,
    loserId,
    gameSessionId: game_session_id,
    endedReason: 'normal',
    winnerScore: Math.max(pScore, oScore),
    loserScore: Math.min(pScore, oScore),
    winnerChkobbas: pScore > oScore ? (chkobba_count || 0) : 0,
    loserChkobbas: pScore > oScore ? 0 : (chkobba_count || 0)
  });
  res.json({ ok: true });
});

app.post('/api/match/bot-win', authRequired, async (req, res) => {
  const { difficulty, player_won } = req.body || {};
  if (difficulty === 'expert' && player_won) {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured.' });
    
    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('id, total_elo')
      .eq('id', req.user.id)
      .maybeSingle();

    if (pErr || !profile) return res.status(400).json({ error: 'Profile not found.' });

    const newElo = (profile.total_elo || 1000) + 1;
    const { error: uErr } = await supabaseAdmin
      .from('profiles')
      .update({ total_elo: newElo, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);

    if (uErr) return res.status(400).json({ error: 'Failed to update Elo.' });
    
    return res.json({ ok: true, newElo });
  }
  res.json({ ok: false, msg: 'No Elo reward for this match.' });
});

io.on('connection', (socket) => {
  // Use built-in clientsCount for real-time accuracy (with tiny delay to ensure sync)
  setTimeout(() => {
    io.emit('userCountUpdate', io.engine.clientsCount);
  }, 100);
  console.log(`[+] Connected: ${socket.id} (Total: ${io.engine.clientsCount})`);

  // ── USER COUNT HANDSHAKE ────────────────────────────────────────
  socket.on('get-user-count', () => {
    socket.emit('userCountUpdate', io.engine.clientsCount);
  });

  // ── CREATE PARTY ──────────────────────────────────────────────
  socket.on('create-party', ({ name, avatar, sessionToken, userId }) => {
    let code;
    do { code = generateCode(); } while (rooms[code]);

    rooms[code] = {
      code,
      host: socket.id,
      players: [{ 
        id: socket.id, 
        name: name, 
        avatar: avatar, 
        sessionToken: sessionToken,
        matchAccepted: false 
      }],
      settings: { mode: '1v1', score: 21 },
      gameState: null,
      roundCount: 1,
      matchFoundTimeout: null,
      teams: { 1: [socket.id, null], 2: [null, null] },
      reconnectTimers: {},
      gameStarted: false,
    };

    socket.join(code);
    socket.data.code = code;
    socket.data.name = name;
    socket.data.sessionToken = sessionToken;

    socket.emit('party-created', { 
      code, 
      settings: rooms[code].settings, 
      teams: rooms[code].teams,
      players: rooms[code].players 
    });
    console.log(`[ROOM] Created: ${code} by ${name}`);
  });

  // ── JOIN PARTY ────────────────────────────────────────────────
  socket.on('join-party', ({ code, name, avatar, sessionToken, userId }) => {
    const room = rooms[code];
    if (!room) {
      socket.emit('join-error', { msg: 'Tawla mouch mawjouda' });
      return;
    }
    if (room.gameStarted) {
      socket.emit('join-error', { msg: 'El partie deja bdit' });
      return;
    }

    // Allow reconnect by sessionToken (not name — names can collide)
    const existing = sessionToken
      ? room.players.find(p => p.sessionToken === sessionToken)
      : null;

    if (existing) {
      // Cancel pending disconnect timer for the old socket id
      if (room.reconnectTimers[existing.id]) {
        clearTimeout(room.reconnectTimers[existing.id]);
        delete room.reconnectTimers[existing.id];
      }
      const oldId = existing.id;
      existing.id = socket.id; // update to new socket
      if (room.host === oldId) {
          room.host = socket.id;
          console.log(`[ROOM] ${name} (Host) reconnected to ${code}. Host updated to ${socket.id}`);
      }
      socket.join(code);
      socket.data.code = code;
      socket.data.name = name;
      socket.data.sessionToken = sessionToken;

      // Sync team slot with new socket ID
      for (let t in room.teams) {
          room.teams[t] = room.teams[t].map(sid => (sid === oldId ? socket.id : sid));
      }

      io.to(code).emit('players-updated', { players: room.players, teams: room.teams });
      socket.emit('rejoin-success', { code, settings: room.settings, players: room.players, teams: room.teams });
      io.to(code).emit('player-reconnected', { name });
      return;
    }

    const maxPlayers = room.settings.mode === '2v2' ? 4 : 2;
    if (room.players.length >= maxPlayers) {
      socket.emit('join-error', { msg: 'El tawla amlet' });
      return;
    }

    room.players.push({ 
        id: socket.id, 
        name: name || 'Guest', 
        avatar: avatar || '', 
        sessionToken: sessionToken || '', 
        userId: userId || '',
        matchAccepted: false 
    });
    socket.join(code);
    socket.data.code = code;
    socket.data.name = name;
    socket.data.sessionToken = sessionToken;

    socket.emit('join-success', { code, settings: room.settings, players: room.players, teams: room.teams, isHost: false });
    io.to(code).emit('players-updated', { players: room.players, teams: room.teams });
    console.log(`[ROOM] ${name} joined ${code} (${room.players.length} players)`);
  });

  // ── QUICK CHAT ────────────────────────────────────────────────
  socket.on('player-msg', ({ text }) => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room) return;
    io.to(code).emit('new-msg', { text, senderId: socket.id });
  });

  // ── PICK TEAM/SLOT (2v2) ──────────────────────────────────────
  socket.on('pick-team', ({ team, slot }) => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room || room.gameStarted) return;
    if (room.settings.mode !== '2v2') return;

    // Remove player from any team first
    for (let t in room.teams) {
      room.teams[t] = room.teams[t].map(sid => sid === socket.id ? null : sid);
    }

    // Toggle: if they picked it again to leave, we're done
    // Logic: the above loop already removed them.
    // To 'Join' - check if slot empty
    if (team && slot !== undefined) {
      if (room.teams[team][slot] === null) {
        room.teams[team][slot] = socket.id;
      }
    }

    io.to(code).emit('players-updated', { players: room.players, teams: room.teams });
  });

  socket.on('update-settings', ({ mode, score }) => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    if (mode) room.settings.mode = mode;
    if (score) room.settings.score = score;
    io.to(code).emit('settings-updated', room.settings);
  });

  const emitRoomData = (room, playerIdx) => {
    const p = room.players[playerIdx];
    if (!p || !p.id) return;
    
    const clientResponse = { players: room.players, settings: room.settings };
    if (room.gameState) {
        clientResponse.gameState = {
            table: room.gameState.table,
            myHand: room.gameState.hands[playerIdx] || [],
            currentTurn: room.gameState.currentTurn,
            numPlayers: room.gameState.numPlayers || 2,
            deckRemaining: room.gameState.deck.length,
            totalScores: room.gameState.totalScores || [0, 0],
            jaryaCount: room.gameState.jaryaCount || 1,
            maxJaryas: room.gameState.maxJaryas || 6
        };
    }
    console.log(`[SYNC] Emitting room-data to ${p.id} (Slot ${playerIdx})`);
    io.to(p.id).emit('room-data', clientResponse);
  };

  function startGameServer(room) {
    if (!room) return;
    
    // Ensure 2v2 layout is canonical if needed
    if (room.settings.mode === '2v2') {
      const canonicalOrder = [room.teams[1][0], room.teams[2][0], room.teams[1][1], room.teams[2][1]];
      room.players = canonicalOrder.map(sid => room.players.find(p => p.id === sid));
    }
    
    room.gameStarted = true;
    const deck = generateDeck();
    const table = [];
    const numPlayers = room.settings.mode === '2v2' ? 4 : 2;
    const hands = Array.from({ length: numPlayers }, () => []);
    
    for (let i = 0; i < 4; i++) table.push(deck.pop());
    for (let p = 0; p < numPlayers; p++) {
        for (let i = 0; i < 3; i++) hands[p].push(deck.pop());
    }

    room.roundCount = (room.roundCount || 0) + 1;
    room.gameState = {
        deck:               deck,
        table:              table,
        hands:              hands,
        piles:              [[], []], // 2 Teams (Slot 0/2 vs Slot 1/3)
        chkobbas:           [[], []],
        lastCaptor: -1,
        totalScores:        [0, 0],
        jaryaCount:         1, // Track which deal we are on
        maxJaryas:          numPlayers === 4 ? 3 : 6, // 1v1=6 deals, 2v2=3 deals
        readyForNextRound:  Array.from({ length: numPlayers }, () => false),
        currentTurn: (room.roundCount % 2 === 1) ? 0 : 1, // Alternate: Host starts R1, Guest starts R2
        numPlayers: numPlayers,
    };

    // Send game-init individually to each player so they get their own hand
    room.players.forEach((p, idx) => {
      if (!p || !p.id) return;
      io.to(p.id).emit('game-init', {
        code: room.code,
        settings: room.settings,
        players: room.players,
        hostId: room.host,
        myHand: hands[idx],
        table: table,
        currentTurn: room.gameState.currentTurn,
        deckRemaining: room.gameState.deck.length,
        mySlot: idx
      });
      console.log(`[GAME-INIT] Sent to slot ${idx} (${p.id}): hand=${hands[idx].length}, table=${table.length}`);
    });

    // Clear any match found timeout
    if (room.matchFoundTimeout) {
      clearTimeout(room.matchFoundTimeout);
      room.matchFoundTimeout = null;
    }

    console.log(`[ROOM] Game started in ${room.code}. Cards dealt and sent.`);
  }

  socket.on('start-game', () => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    
    const required = room.settings.mode === '2v2' ? 4 : 2;
    if (room.players.length < required) return;
    
    startGameServer(room);
  });

  socket.on('match-accept', () => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.matchAccepted = true;
    console.log(`[MATCH] Player ${player.name} accepted in ${code}`);

    // Notify others in the room
    io.to(code).emit('player-accepted', { playerId: socket.id, name: player.name });

    // Check if everyone accepted
    const required = room.settings.mode === '2v2' ? 4 : 2;
    const readyCount = room.players.filter(p => p.matchAccepted).length;

    if (readyCount >= required && !room.gameStarted) {
      console.log(`[MATCH] All players accepted in ${code}. Auto-starting...`);
      startGameServer(room);
    }
  });

  // ── GAME ROOM HANDLERS ───────────────────────────────────────
  socket.on('join-room', (code, token) => {
    const room = rooms[code];
    if (room) {
      const playerIdx = room.players.findIndex(p => p.sessionToken === token);
      if (playerIdx !== -1) {
          const player = room.players[playerIdx];
          player.id = socket.id;
          
          socket.join(code);
          socket.data.code = code;
          socket.data.slotIdx = playerIdx; 
          
          console.log(`[SYNC] Player joined room: ${code}, token: ${token}, slot: ${playerIdx}, socket: ${socket.id}`);
          
          // Sync ONLY the player who just joined
          emitRoomData(room, playerIdx);
      } else {
          console.warn(`[SYNC] Player with token ${token} NOT found in room ${code}`);
      }
      
      // Clear any pending cleanup for this room
      if (room.cleanupTimeout) {
          clearTimeout(room.cleanupTimeout);
          delete room.cleanupTimeout;
      }
    } else {
      console.warn(`[SYNC] join-room: Room ${code} not found.`);
    }
  });

  socket.on('make-move', (data) => {
    const code = socket.data.code;
    const mySlotIdx = socket.data.slotIdx;
    const room = rooms[code];
    if (!room || !room.gameState) return;
    
    const state = room.gameState;
    
    // Validate turn
    if (state.currentTurn !== mySlotIdx) return;
    
    const { cardId, capturedIds } = data;
    
    // Validate card existence in hand
    const cardObj = state.hands[mySlotIdx].find(c => c.id === cardId);
    if (!cardObj) return;

    // Validate math
    if (capturedIds && capturedIds.length > 0) {
        const tableCards = state.table.filter(t => capturedIds.includes(t.id));
        if (tableCards.length !== capturedIds.length) return; // invalid IDs

        const totalValue = tableCards.reduce((sum, c) => sum + c.value, 0);
        const isValid = totalValue === cardObj.value || (tableCards.length === 1 && tableCards[0].value === cardObj.value);
        if (!isValid) return; // Cheating detected
    }
    
    // Apply move to server state
    state.hands[mySlotIdx] = state.hands[mySlotIdx].filter(c => c.id !== cardId);
    
    // Team identification
    const teamIdx = mySlotIdx % 2;
    
    let chkobba = false;
    if (capturedIds && capturedIds.length > 0) {
        const capturedCards = state.table.filter(c => capturedIds.includes(c.id));
        state.table = state.table.filter(c => !capturedIds.includes(c.id));
        state.piles[teamIdx].push(cardObj, ...capturedCards);
        state.lastCaptor = teamIdx;
        
        // RULE: No Chkobba on the very last card of the entire 40-card round
        // We detect this by checking if the deck is empty AND hands will be empty after this move
        const isFinalCardOfRound = state.deck.length === 0 && state.hands.every(h => h.length === 0);
        
        if (state.table.length === 0 && !isFinalCardOfRound) {
            state.chkobbas[teamIdx].push(cardObj);
            chkobba = true;
        }
    } else {
        state.table.push(cardObj);
    }
    
    // Advance turn (supports 2 or 4 players)
    const np = state.numPlayers || 2;
    state.currentTurn = (state.currentTurn + 1) % np;
    
    // ── CHECK FOR MID-GAME DEAL (New Round) ──────────────────────
    const allHandsEmpty = state.hands.every(h => h.length === 0);
    let newCardsDealt = false;
    let jaryaEnded = false;
    let results = null;
    
    if (allHandsEmpty) {
        if (state.deck.length > 0) {
            // NEXT JARYA: Deal 3 cards to everyone
            state.jaryaCount++;
            for (let p = 0; p < np; p++) {
                for (let i = 0; i < 3; i++) {
                    const card = state.deck.pop();
                    if (card) state.hands[p].push(card);
                }
            }
            newCardsDealt = true;
            console.log(`[GAME] Next Jarya ${state.jaryaCount} in room ${code}. Deck remaining: ${state.deck.length}`);
        } else {
            // ROUND END: Deck and Hands are both empty
            jaryaEnded = true;
            console.log(`[GAME] Round Over in room ${code}. Deck and Hands exhausted.`);
            
            // Finalize Round: award ALL remaining table AND deck cards to last captor
            if (state.lastCaptor >= 0) {
                const leftovers = [...state.table];
                if (leftovers.length > 0) {
                    state.piles[state.lastCaptor].push(...leftovers);
                    console.log(`   -> Awarded ${leftovers.length} table cards to team ${state.lastCaptor}`);
                    state.table = [];
                }
            }
            // Calculate Scores
            results = calculateRoundPoints(state);
            state.totalScores[0] += results.pts[0];
            state.totalScores[1] += results.pts[1];
        }
    }
    
    // Broadcast the action to ALL clients
    io.to(code).emit('move-played', {
        playerIdx: mySlotIdx,
        cardId: cardId,
        capturedIds: capturedIds || [],
        newTurn: state.currentTurn,
        newCardsDealt: newCardsDealt,
        deckRemaining: state.deck.length,
        isJaryaEnded: jaryaEnded,
        jaryaCount: state.jaryaCount,
        maxJaryas: state.maxJaryas
    });
    
    if (newCardsDealt) {
        const np3 = state.numPlayers || 2;
        const jaryaData = {
            table: state.table,
            currentTurn: state.currentTurn,
            jaryaCount: state.jaryaCount,
            maxJaryas: state.maxJaryas,
            deckRemaining: state.deck.length
        };
        for (let i = 0; i < np3; i++) {
            const p = room.players[i];
            if (p && p.id) {
                io.to(p.id).emit('deal-cards', { 
                    myHand: state.hands[i],
                    ...jaryaData
                });
            }
        }
    } else if (jaryaEnded) {
        setTimeout(() => {
            io.to(code).emit('jarya-ended', {
                results: results,
                totals: state.totalScores,
                winScore: room.settings.score
            });
        }, 1500); // Allow time for final visual capture
    }
  });

  socket.on('next-round', () => {
      const code = socket.data.code;
      let mySlotIdx = socket.data.slotIdx;
      const room = rooms[code];
      if (!room || !room.gameState) return;
      
      const state = room.gameState;
      const np = state.numPlayers || 2;
      if (mySlotIdx === undefined || mySlotIdx === null || mySlotIdx < 0) {
          // Fallback: recover slot from current socket id (in case slotIdx was lost)
          mySlotIdx = room.players.findIndex(p => p && p.id === socket.id);
          socket.data.slotIdx = mySlotIdx;
      }
      if (mySlotIdx < 0 || mySlotIdx >= np) return;
      state.readyForNextRound[mySlotIdx] = true;
      
      io.to(code).emit('player-ready', { playerIdx: mySlotIdx });
      
      // Robust Readiness Check: rely on slot indices, not socket IDs
      const readyCount = state.readyForNextRound.filter(val => val === true).length;

      if (readyCount >= np) {
          // Restart Round
          const newDeck = generateDeck();
          const newTable = [];
          for (let i = 0; i < 4; i++) newTable.push(newDeck.pop());
          
          const newHands = Array.from({ length: np }, () => []);
          for (let p = 0; p < np; p++) {
              for (let i = 0; i < 3; i++) newHands[p].push(newDeck.pop());
          }
          
          room.roundCount++;
          
          // Rebuild gameState: preserve totalScores, reset everything else
          room.gameState = {
              ...state, // preserves totalScores
              deck: newDeck,
              table: newTable,
              hands: newHands,
              piles: [[], []],
              chkobbas: [[], []],
              lastCaptor: -1,
              jaryaCount: 1,
              readyForNextRound: [false, false, false, false],
              currentTurn: (room.roundCount % 2 === 0) ? 1 : 0 // Alternate: Round 1 (Odd) Host starts, Round 2 (Even) Guest starts
          };

          const jaryaData = {
              table: room.gameState.table,
              currentTurn: room.gameState.currentTurn,
              jaryaCount: 1,
              maxJaryas: room.gameState.maxJaryas,
              deckRemaining: room.gameState.deck.length,
              roundCount: room.roundCount,
              isNewRound: true
          };
          
          for (let i = 0; i < np; i++) {
              const p = room.players[i];
              if (p && p.id) {
                  io.to(p.id).emit('deal-cards', { 
                      myHand: room.gameState.hands[i],
                      ...jaryaData
                  });
              }
          }
          console.log(`[GAME] New Round ${room.roundCount} initialized in room: ${code}`);
      }
  });

  // ── KICK PLAYER (host only) ───────────────────────────────────
  socket.on('kick-player', ({ playerId }) => {
    const code = socket.data.code;
    const room = rooms[code];
    console.log(`[ROOM] Kick attempt: room=${code}, target=${playerId}, requester=${socket.id}`);
    if (!room) { 
      socket.emit('kick-error', { msg: "Ghorfa mouch mawjouda" });
      console.log("   -> Room not found"); return; 
    }
    if (room.host !== socket.id) { 
      socket.emit('kick-error', { msg: "Mouch enti el moulat-el-ghorfa!" });
      console.log(`   -> Not host (Host is ${room.host})`); return; 
    }
    if (room.gameStarted) { 
      socket.emit('kick-error', { msg: "El partie bdit!" });
      console.log("   -> Game already started"); return; 
    }
    
    // Find player index
    const pIdx = room.players.findIndex(p => p.id === playerId);
    if (pIdx === -1) { 
      socket.emit('kick-error', { msg: "La3eb mouch mawjoud fi el ghorfa" });
      console.log("   -> Target player not in room.players list"); return; 
    }
    if (room.players[pIdx].role === 'host') { 
      socket.emit('kick-error', { msg: "Matnajamch t'kiki el moulat-el-ghorfa!" });
      console.log("   -> Target is host (cannot kick)"); return; 
    }

    const kickedPlayer = room.players[pIdx];
    
    // Remove from teams
    for (let t in room.teams) {
      room.teams[t] = room.teams[t].map(sid => sid === playerId ? null : sid);
    }
    
    // Remove from players list
    room.players.splice(pIdx, 1);
    
    // Force leave room and clear data
    const kickedSocket = io.sockets.sockets.get(playerId);
    if (kickedSocket) {
        kickedSocket.leave(code);
        delete kickedSocket.data.code;
    }

    // Inform the kicked player (emit directly to socket id in case they left room already)
    io.to(playerId).emit('player-kicked', { msg: "Yezik mil l3ab, t'7atit lbara (Kicked by Host)" });
    
    // Inform others
    io.to(code).emit('players-updated', { players: room.players, teams: room.teams });
    io.to(code).emit('player-left', { name: kickedPlayer.name });
    console.log(`[ROOM] ${kickedPlayer.name} kicked from ${code}`);
  });

  // ── DISCONNECT ────────────────────────────────────────────────
  socket.on('sync-state', () => {
    const code = socket.data.code;
    const room = rooms[code];
    if (room) {
      const playerIdx = room.players.findIndex(p => p.id === socket.id);
      if (playerIdx !== -1) {
        console.log(`[SYNC] Manual sync requested by ${socket.id} (Slot ${playerIdx})`);
        emitRoomData(room, playerIdx);
      }
    }
  });
  socket.on('leave-room', () => {
    const code = socket.data.code;
    const room = rooms[code];
    console.log(`[LEAVE-ROOM] Socket ${socket.id} (${socket.data.name}) leaving code: ${code}`);

    if (!room) {
      console.log(`[LEAVE-ROOM] No room found for code ${code}`);
      return;
    }

    const oldId = socket.id;
    const pIdx = room.players.findIndex(p => p.id === oldId);
    if (pIdx === -1) {
      console.log(`[LEAVE-ROOM] Player not in room list, removing socket from code ${code}`);
      socket.leave(code);
      delete socket.data.code;
      return;
    }

    const name = room.players[pIdx].name || 'Player';

    if (room.reconnectTimers && room.reconnectTimers[oldId]) {
      clearTimeout(room.reconnectTimers[oldId]);
      delete room.reconnectTimers[oldId];
    }

    // Always check for ranked forfeit first, even if gameStarted is false
    const rankedMeta = rankedRoomByCode[code];
    if (rankedMeta && !rankedMeta.finished) {
      console.log(`[LEAVE-ROOM] Ranked match detected. Finalizing forfeit for ${name}`);
      finalizeForfeit(code, oldId, 'leave-room');
    }

    if (!room.gameStarted) {
      if (room.host === oldId) {
        console.log(`[ROOM] Host left lobby. Closing room: ${code}`);
        io.to(code).emit('room-closed', { reason: 'host-left' });
        delete rooms[code];
      } else {
        const idx = room.players.findIndex(p => p && p.id === oldId);
        if (idx !== -1) room.players.splice(idx, 1);
        for (let t in room.teams) {
          room.teams[t] = room.teams[t].map(sid => (sid === oldId ? null : sid));
        }
        io.to(code).emit('players-updated', { players: room.players, teams: room.teams });
        io.to(code).emit('player-left', { name });
        if (room.players.length === 0) delete rooms[code];
        console.log(`[ROOM] Player ${name} left lobby: ${code}`);
      }
    } else {
      if (room.host === oldId) {
        console.log(`[ROOM] Host left game gracefully. Closing room: ${code}`);
        io.to(code).emit('room-closed', { reason: 'host-left' });
        delete rooms[code];
      } else {
        const idx = room.players.findIndex(p => p && p.id === oldId);
        if (idx !== -1) {
          room.players.splice(idx, 1);
        }
        for (let t in room.teams) {
          room.teams[t] = room.teams[t].map(sid => (sid === oldId ? null : sid));
        }
        io.to(code).emit('players-updated', { players: room.players, teams: room.teams });
        io.to(code).emit('player-left', { name });
        if (room.players.length === 0) delete rooms[code];
        console.log(`[ROOM] Player ${name} left game gracefully: ${code}`);
      }
    }

    socket.leave(code);
    delete socket.data.code;
    delete socket.data.slotIdx;
  });

  function finalizeForfeit(code, loserSocketId, reason = 'forfeit') {
    const room = rooms[code];
    const rankedMeta = rankedRoomByCode[code];
    console.log(`[FINALIZE-FORFEIT] Room: ${code}, Reason: ${reason}`);

    if (!room) {
      console.log(`[FINALIZE-FORFEIT] No room found for code: ${code}`);
      return;
    }
    if (!rankedMeta) {
      console.log(`[FINALIZE-FORFEIT] No ranked metadata found for code: ${code}`);
      return;
    }
    if (rankedMeta.finished) {
      console.log(`[FINALIZE-FORFEIT] Ranked match already finished for code: ${code}`);
      return;
    }

    const loser = room.players.find(p => p && p.id === loserSocketId);
    if (!loser) {
      console.log(`[FINALIZE-FORFEIT] Loser socket ${loserSocketId} not found in room.players`);
    }

    const loserId = loser?.userId;
    if (!loserId) {
      console.log(`[FINALIZE-FORFEIT] Cannot proceed, loserId is missing for ${loserSocketId}`);
      return;
    }

    const winnerId = (rankedMeta.player1Id === loserId) ? rankedMeta.player2Id : rankedMeta.player1Id;
    rankedMeta.finished = true;

    console.log(`[RANKED] Forfeit in room ${code}. Winner: ${winnerId}, Loser: ${loserId} (Reason: ${reason})`);

    applyMatchResult({
      winnerId,
      loserId,
      gameSessionId: rankedMeta.sessionId,
      endedReason: reason,
      winnerScore: 1,
      loserScore: 0,
      winnerChkobbas: 0,
      loserChkobbas: 0
    });

    console.log(`[FINALIZE-FORFEIT] Result applied to DB. Emitting opponent-forfeited to room.`);
    io.to(code).emit('opponent-forfeited', { 
      loserName: loser?.name || 'Opponent',
      reason
    });
  }

  socket.on('disconnect', () => {
    io.emit('userCountUpdate', io.engine.clientsCount);
    const code = socket.data.code;
    const room = rooms[code];
    if (room) {
      io.to(code).emit('player-disconnected', { name: socket.data.name });
      
      if (room.gameStarted) {
          const rankedMeta = rankedRoomByCode[code];
          if (rankedMeta && !rankedMeta.finished) {
              // Set a 20s grace period for ranked disconnects
              if (room.reconnectTimers) {
                  const socketId = socket.id;
                  room.reconnectTimers[socketId] = setTimeout(() => {
                      finalizeForfeit(code, socketId, 'disconnect-timeout');
                  }, 20000);
              }
          }
      }

      // Delay room cleanup
      const cleanupTime = room.gameStarted ? 20000 : 5000;

      if (!room.cleanupTimeout) {
          room.cleanupTimeout = setTimeout(() => {
              const anyActive = room.players.some(p => io.sockets.sockets.has(p.id));
              if (!anyActive) {
                  delete rooms[code];
                  console.log(`[ROOM] Deleted idle room: ${code} (${room.gameStarted ? 'Game' : 'Lobby'})`);
              } else {
                  // If host is gone but others are here, and it's a lobby, we should probably close it
                  const hostActive = io.sockets.sockets.has(room.host);
                  if (!hostActive) {
                    console.log(`[ROOM] Host timeout in ${room.gameStarted ? 'Game' : 'Lobby'}. Closing: ${code}`);
                    io.to(code).emit('room-closed', { reason: 'host-timeout' });
                    delete rooms[code];
                  } else {
                    delete room.cleanupTimeout;
                  }
              }
          }, cleanupTime);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🃏 Chkobba server running → http://localhost:${PORT}\n`);
});
