const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

// ----- Static assets -----
// Serve pages folder at root, and root folder for css/js/img etc.
app.use(express.static(path.join(__dirname, 'pages')));
app.use('/css',    express.static(path.join(__dirname, 'css')));
app.use('/js',     express.static(path.join(__dirname, 'js')));
app.use('/img',    express.static(path.join(__dirname, 'img')));
app.use('/cards',  express.static(path.join(__dirname, 'cards')));
app.use('/sound',  express.static(path.join(__dirname, 'sound')));
app.use('/pfp',    express.static(path.join(__dirname, 'pfp')));

// SPA Routes
app.get(['/', '/menu.html', '/lobby.html', '/chkobba.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'index.html'));
});

// ----- In-memory room store -----
// rooms[code] = { host, settings, players: [{id, name, avatar}], reconnectTimers: {} }
const rooms = {};

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
  const sab3a = pile.some(c => c.suit === 'carreau' && c.value === 7);
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
    carta: s0.cards > s1.cards ? 0 : (s1.cards > s0.cards ? 1 : -1),
    dineri: s0.dineri > s1.dineri ? 0 : (s1.dineri > s0.dineri ? 1 : -1),
    sab3a: s0.sab3a ? 0 : (s1.sab3a ? 1 : -1),
    barmila,
    chkobba0: state.chkobbas[0].length,
    chkobba1: state.chkobbas[1].length,
  };
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── CREATE PARTY ──────────────────────────────────────────────
  socket.on('create-party', ({ name, avatar, sessionToken }) => {
    let code;
    do { code = generateCode(); } while (rooms[code]);

    rooms[code] = {
      host: socket.id,
      settings: { mode: '1v1', score: 21 },
      players: [{ id: socket.id, name: name || 'Host', avatar: avatar || '', sessionToken: sessionToken || '', role: 'host' }],
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
  socket.on('join-party', ({ code, name, avatar, sessionToken }) => {
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
      existing.id = socket.id; // update to new socket
      socket.join(code);
      socket.data.code = code;
      socket.data.name = name;
      socket.data.sessionToken = sessionToken;
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

    room.players.push({ id: socket.id, name: name || 'Guest', avatar: avatar || '', sessionToken: sessionToken || '' });
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

  // ── UPDATE SETTINGS (host only) ───────────────────────────────
  socket.on('update-settings', ({ mode, score }) => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    if (mode) room.settings.mode = mode;
    if (score) room.settings.score = score;
    io.to(code).emit('settings-updated', room.settings);
  });

  // ── START GAME (host only) ────────────────────────────────────
  socket.on('start-game', () => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    const required = room.settings.mode === '2v2' ? 4 : 2;
    if (room.players.length < required) return;
    
    // For 2v2, ensure teams are full
    if (room.settings.mode === '2v2') {
      const allFilled = room.teams[1].every(s => s !== null) && room.teams[2].every(s => s !== null);
      if (!allFilled) return;
      
      // Reorder room.players to Match Seating: 
      // [T1S0, T2S0, T1S1, T2S1]
      const canonicalOrder = [
        room.teams[1][0],
        room.teams[2][0],
        room.teams[1][1],
        room.teams[2][1]
      ];
      room.players = canonicalOrder.map(sid => room.players.find(p => p.id === sid));
    }
    
    room.gameStarted = true;
    
    // Initialize Server-Authoritative State
    const deck = generateDeck();
    const table = [];
    const numPlayers = room.settings.mode === '2v2' ? 4 : 2;
    const hands = Array.from({ length: numPlayers }, () => []);
    
    // Deal 4 to table
    for (let i = 0; i < 4; i++) {
        table.push(deck.pop());
    }
    // Deal 3 to each player
    for (let p = 0; p < numPlayers; p++) {
        for (let i = 0; i < 3; i++) {
            hands[p].push(deck.pop());
        }
    }

    room.gameState = {
        deck: deck,
        table: table,
        hands: hands,
        piles:              [[], []], // 2 Teams (Slot 0/2 vs Slot 1/3)
        chkobbas:           [[], []],
        lastCaptor: -1,
        totalScores:        [0, 0],
        readyForNextRound:  Array.from({ length: numPlayers }, () => false),
        currentTurn: 1, // slot-1 (Top) plays first
        numPlayers: numPlayers,
    };

    io.to(code).emit('game-init', {
      code,
      settings: room.settings,
      players: room.players,
      hostId: room.host
    });
    console.log(`[ROOM] Game started in ${code} (${numPlayers}P)`);
  });

  // ── GAME ROOM HANDLERS ───────────────────────────────────────
  socket.on('join-room', (code, token) => {
    const room = rooms[code];
    if (room) {
      // Update the player's socket ID in the room based on their token
      const playerIdx = room.players.findIndex(p => p.sessionToken === token);
      if (playerIdx !== -1) {
          const player = room.players[playerIdx];
          player.id = socket.id;
          if (player.role === 'host') room.host = socket.id;
          
          socket.join(code);
          socket.data.code = code;
          socket.data.slotIdx = playerIdx; // 0, 1, 2, or 3
          
          const response = {
              players: room.players,
              settings: room.settings
          };
          
          if (room.gameState) {
              response.gameState = {
                  table: room.gameState.table,
                  myHand: room.gameState.hands[playerIdx],
                  currentTurn: room.gameState.currentTurn,
                  numPlayers: room.gameState.numPlayers || 2,
                  deckRemaining: room.gameState.deck.length
              };
          }
          
          room.players.forEach((p, idx) => {
              if (p.id) {
                  const clientResponse = { players: room.players, settings: room.settings };
                  if (room.gameState) {
                      clientResponse.gameState = {
                          table: room.gameState.table,
                          myHand: room.gameState.hands[idx],
                          currentTurn: room.gameState.currentTurn,
                          numPlayers: room.gameState.numPlayers || 2,
                          deckRemaining: room.gameState.deck.length
                      };
                  }
                  io.to(p.id).emit('room-data', clientResponse);
              }
          });
      }
      
      // Clear any pending cleanup for this room
      if (room.cleanupTimeout) {
          clearTimeout(room.cleanupTimeout);
          delete room.cleanupTimeout;
      }
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
        
        const isLastCardOfJarya = state.deck.length === 0 && state.hands.every(h => h.length === 0);
        
        if (state.table.length === 0 && !isLastCardOfJarya) {
            state.chkobbas[teamIdx].push(cardObj);
            chkobba = true;
        }
    } else {
        state.table.push(cardObj);
    }
    
    // Advance turn (supports 2 or 4 players)
    const np = state.numPlayers || 2;
    state.currentTurn = (state.currentTurn + 1) % np;
    
    // Check if all hands are empty for dealing more cards
    const bothHandsEmpty = state.hands.every(h => h.length === 0);
    let newCardsDealt = false;
    let jaryaEnded = false;
    let results = null;
    
    if (bothHandsEmpty) {
        if (state.deck.length > 0) {
            const np2 = state.numPlayers || 2;
            for (let p = 0; p < np2; p++) {
                for (let i = 0; i < 3; i++) {
                    state.hands[p].push(state.deck.pop());
                }
            }
            newCardsDealt = true;
        } else {
            jaryaEnded = true;
            // Finalize Jarya (give remaining table cards to last captor)
            if (state.lastCaptor >= 0 && state.table.length > 0) {
                state.piles[state.lastCaptor].push(...state.table);
                state.table = [];
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
        isJaryaEnded: jaryaEnded
    });
    
    if (newCardsDealt) {
        const np3 = state.numPlayers || 2;
        for (let i = 0; i < np3; i++) {
            const p = room.players[i];
            if (p && p.id) io.to(p.id).emit('deal-cards', { myHand: state.hands[i] });
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
      const mySlotIdx = socket.data.slotIdx;
      const room = rooms[code];
      if (!room || !room.gameState) return;
      
      const state = room.gameState;
      const np = state.numPlayers || 2;
      state.readyForNextRound[mySlotIdx] = true;
      
      io.to(code).emit('player-ready', { playerIdx: mySlotIdx });
      
      // Check all players are ready
      const allReady = state.readyForNextRound.slice(0, np).every(r => r);
      if (allReady) {
          // Restart Jarya
          const deck = generateDeck();
          const table = [];
          for (let i = 0; i < 4; i++) table.push(deck.pop());
          const hands = Array.from({ length: np }, () => []);
          for (let p = 0; p < np; p++) {
              for (let i = 0; i < 3; i++) hands[p].push(deck.pop());
          }
          state.deck = deck;
          state.table = table;
          state.hands = hands;
          state.piles     = [[], []]; // 2 Teams
          state.chkobbas  = [[], []];
          state.lastCaptor = -1;
          state.readyForNextRound = Array.from({ length: np }, () => false);
          state.currentTurn = 1;
          
          io.to(code).emit('jarya-started', {
              table: state.table,
              currentTurn: state.currentTurn
          });
          
          for (let i = 0; i < np; i++) {
              const p = room.players[i];
              if (p && p.id) io.to(p.id).emit('deal-cards', { myHand: hands[i] });
          }
      }
  });

  // ── DISCONNECT ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const code = socket.data.code;
    const room = rooms[code];
    if (room) {
      io.to(code).emit('player-disconnected', { name: socket.data.name });
      
      // Delay room cleanup to allow for refreshes/reconnects
      if (!room.cleanupTimeout) {
          room.cleanupTimeout = setTimeout(() => {
              // Check if any players are still connected
              const anyActive = room.players.some(p => io.sockets.sockets.has(p.id));
              if (!anyActive) {
                  delete rooms[code];
                  console.log(`[ROOM] Deleted idle room: ${code}`);
              } else {
                  delete room.cleanupTimeout;
              }
          }, 30000); // 30 seconds grace period
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🃏 Chkobba server running → http://localhost:${PORT}\n`);
});
