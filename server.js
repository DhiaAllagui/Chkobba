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
  };
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── CREATE PARTY ──────────────────────────────────────────────
  socket.on('create-party', ({ name, avatar, sessionToken }) => {
    let code;
    do { code = generateCode(); } while (rooms[code]);

    rooms[code] = {
      code,
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
    
    // ── INITIAL DEAL (Start of Jarya) ──────────────────────────
    const deck = generateDeck(); // Shuffle happens only here
    const table = [];
    const numPlayers = room.settings.mode === '2v2' ? 4 : 2;
    const hands = Array.from({ length: numPlayers }, () => []);
    
    // 1. Put 4 cards on the table (Only at start of 40-card cycle)
    for (let i = 0; i < 4; i++) {
        table.push(deck.pop());
    }
    // 2. Deal 3 to each player
    for (let p = 0; p < numPlayers; p++) {
        for (let i = 0; i < 3; i++) {
            hands[p].push(deck.pop());
        }
    }

    room.roundCount = (room.roundCount || 0) + 1;

    room.gameState = {
        deck: deck,
        table: table,
        hands: hands,
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

    const roomDataBase = {
      table: table,
      currentTurn: room.gameState.currentTurn,
      numPlayers: numPlayers,
      deckRemaining: deck.length,
      jaryaCount: 1,
      maxJaryas: room.gameState.maxJaryas
    };

    io.to(code).emit('game-init', {
      code,
      settings: room.settings,
      players: room.players,
      hostId: room.host
    });

    for (let i = 0; i < numPlayers; i++) {
        const p = room.players[i];
        if (p && p.id) {
            io.to(p.id).emit('room-data', {
                ...roomDataBase,
                myHand: hands[i]
            });
        }
    }
    console.log(`[ROOM] Game started in ${code} (${numPlayers}P). Initial data pushed.`);
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
                  deckRemaining: room.gameState.deck.length,
                  totalScores: room.gameState.totalScores || [0, 0],
                  jaryaCount: room.gameState.jaryaCount,
                  maxJaryas: room.gameState.maxJaryas
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
                          deckRemaining: room.gameState.deck.length,
                          totalScores: room.gameState.totalScores || [0, 0],
                          jaryaCount: room.gameState.jaryaCount,
                          maxJaryas: room.gameState.maxJaryas
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
    if (!room || !room.gameState) return;
    
    const pIdx = room.players.findIndex(p => p.id === socket.id);
    if (pIdx === -1) return;

    socket.emit('room-data', {
        table: room.gameState.table,
        myHand: room.gameState.hands[pIdx],
        currentTurn: room.gameState.currentTurn,
        numPlayers: room.gameState.numPlayers || 2,
        deckRemaining: room.gameState.deck.length,
        jaryaCount: room.gameState.jaryaCount,
        maxJaryas: room.gameState.maxJaryas
    });
  });

  socket.on('leave-room', () => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room) return;

    // Graceful leave: allow 30s to come back (refresh/back-to-menu)
    const oldId = socket.id;
    const pIdx = room.players.findIndex(p => p.id === oldId);
    if (pIdx === -1) {
      socket.leave(code);
      delete socket.data.code;
      return;
    }

    const name = room.players[pIdx].name || 'Player';
    io.to(code).emit('player-disconnected', { name });

    if (room.reconnectTimers[oldId]) {
      clearTimeout(room.reconnectTimers[oldId]);
      delete room.reconnectTimers[oldId];
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
      // In-game cleanup: For deliberate leave-room, we can close immediately if host
      if (room.host === oldId) {
        console.log(`[ROOM] Host left game gracefully. Closing room: ${code}`);
        io.to(code).emit('room-closed', { reason: 'host-left' });
        delete rooms[code];
      } else {
        // Guest left: 30s grace period for reconnect
        room.reconnectTimers[oldId] = setTimeout(() => {
          const r = rooms[code];
          if (!r) return;
          const stillSameSocket = r.players.some(p => p && p.id === oldId);
          if (!stillSameSocket) {
            delete r.reconnectTimers[oldId];
            return;
          }
          const idx2 = r.players.findIndex(p => p && p.id === oldId);
          const pname = idx2 !== -1 ? (r.players[idx2].name || name) : name;
          if (idx2 !== -1) r.players.splice(idx2, 1);
          for (let t in r.teams) {
            r.teams[t] = r.teams[t].map(sid => (sid === oldId ? null : sid));
          }
          io.to(code).emit('players-updated', { players: r.players, teams: r.teams });
          io.to(code).emit('player-left', { name: pname });
          delete r.reconnectTimers[oldId];
          console.log(`[ROOM] Player ${pname} removed after 30s: ${code}`);
        }, 30000);
      }
    }

    socket.leave(code);
    delete socket.data.code;
    delete socket.data.slotIdx;
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    const room = rooms[code];
    if (room) {
      io.to(code).emit('player-disconnected', { name: socket.data.name });
      
      // Delay room cleanup for active games to allow for reconnects
      // BUT if it's a lobby and nobody is left, delete it faster
      const cleanupTime = room.gameStarted ? 30000 : 5000;

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
