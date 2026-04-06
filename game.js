const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// ----- Static assets -----
app.use(express.static(path.join(__dirname, 'pages')));
app.use('/css',    express.static(path.join(__dirname, 'css')));
app.use('/js',     express.static(path.join(__dirname, 'js')));
app.use('/img',    express.static(path.join(__dirname, 'img')));
app.use('/cards',  express.static(path.join(__dirname, 'cards')));
app.use('/sound',  express.static(path.join(__dirname, 'sound')));
app.use('/pfp',    express.static(path.join(__dirname, 'pfp')));

app.get(['/', '/menu.html', '/lobby.html', '/chkobba.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'index.html'));
});

const rooms = {};

function generateCode() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `CK-${n}`;
}

function generateDeck() {
  const suits = ['carreau', 'coeur', 'trefel', 'pique'];
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  let deck = [];
  suits.forEach(suit => {
    values.forEach(v => {
      deck.push({ 
        id: `${v}${suit}`, 
        suit: suit, 
        value: v, 
        is7ayya: (v === 7 && suit === 'carreau') 
      });
    });
  });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

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
    socket.emit('party-created', { code, settings: rooms[code].settings, teams: rooms[code].teams, players: rooms[code].players });
  });

  socket.on('join-party', ({ code, name, avatar, sessionToken }) => {
    const room = rooms[code];
    if (!room) return socket.emit('join-error', { msg: 'Tawla mouch mawjouda' });
    if (room.gameStarted) return socket.emit('join-error', { msg: 'El partie deja bdit' });

    const existing = sessionToken ? room.players.find(p => p.sessionToken === sessionToken) : null;

    if (existing) {
      if (room.reconnectTimers[existing.id]) {
        clearTimeout(room.reconnectTimers[existing.id]);
        delete room.reconnectTimers[existing.id];
      }
      const oldId = existing.id;
      existing.id = socket.id;
      if (room.host === oldId) room.host = socket.id;
      socket.join(code);
      socket.data.code = code;
      for (let t in room.teams) {
          room.teams[t] = room.teams[t].map(sid => (sid === oldId ? socket.id : sid));
      }
      io.to(code).emit('players-updated', { players: room.players, teams: room.teams });
      socket.emit('rejoin-success', { code, settings: room.settings, players: room.players, teams: room.teams });
      return;
    }

    const maxPlayers = room.settings.mode === '2v2' ? 4 : 2;
    if (room.players.length >= maxPlayers) return socket.emit('join-error', { msg: 'El tawla amlet' });

    room.players.push({ id: socket.id, name: name || 'Guest', avatar: avatar || '', sessionToken: sessionToken || '' });
    socket.join(code);
    socket.data.code = code;
    socket.emit('join-success', { code, settings: room.settings, players: room.players, teams: room.teams, isHost: false });
    io.to(code).emit('players-updated', { players: room.players, teams: room.teams });
  });

  socket.on('start-game', () => {
    const code = socket.data.code;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    const required = room.settings.mode === '2v2' ? 4 : 2;
    if (room.players.length < required) return;
    
    if (room.settings.mode === '2v2') {
      const allFilled = room.teams[1].every(s => s !== null) && room.teams[2].every(s => s !== null);
      if (!allFilled) return;
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

    room.roundCount = 1;
    room.gameState = {
        deck, table, hands,
        piles: [[], []],
        chkobbas: [[], []],
        lastCaptor: -1,
        totalScores: [0, 0],
        jaryaCount: 1,
        maxJaryas: numPlayers === 4 ? 3 : 6,
        readyForNextRound: Array.from({ length: numPlayers }, () => false),
        currentTurn: 0,
        numPlayers: numPlayers
    };

    io.to(code).emit('game-init', { code, settings: room.settings, players: room.players, hostId: room.host });

    room.players.forEach((p, i) => {
        if (p.id) io.to(p.id).emit('room-data', { 
            table, 
            currentTurn: room.gameState.currentTurn, 
            numPlayers, 
            deckRemaining: deck.length, 
            myHand: hands[i],
            roundCount: room.roundCount,
            jaryaCount: room.gameState.jaryaCount,
            maxJaryas: room.gameState.maxJaryas,
            winScore: room.settings.score
        });
    });
  });

  socket.on('join-room', (code, token) => {
    const room = rooms[code];
    if (room) {
      const playerIdx = room.players.findIndex(p => p.sessionToken === token);
      if (playerIdx !== -1) {
          room.players[playerIdx].id = socket.id;
          if (room.players[playerIdx].role === 'host') room.host = socket.id;
          socket.join(code);
          socket.data.code = code;
          socket.data.slotIdx = playerIdx;
          
          if (room.gameState) {
              socket.emit('room-data', {
                  table: room.gameState.table,
                  myHand: room.gameState.hands[playerIdx],
                  currentTurn: room.gameState.currentTurn,
                  numPlayers: room.gameState.numPlayers,
                  deckRemaining: room.gameState.deck.length,
                  totalScores: room.gameState.totalScores,
                  roundCount: room.roundCount,
                  jaryaCount: room.gameState.jaryaCount,
                  maxJaryas: room.gameState.maxJaryas,
                  winScore: room.settings.score
              });
          }
      }
    }
  });

  socket.on('make-move', (data) => {
    const code = socket.data.code;
    const mySlotIdx = socket.data.slotIdx;
    const room = rooms[code];
    if (!room || !room.gameState) return;
    
    const state = room.gameState;
    if (state.currentTurn !== mySlotIdx) return;
    
    const { cardId, capturedIds } = data;
    const cardObj = state.hands[mySlotIdx].find(c => c.id === cardId);
    if (!cardObj) return;

    state.hands[mySlotIdx] = state.hands[mySlotIdx].filter(c => c.id !== cardId);
    const teamIdx = mySlotIdx % 2;
    let chkobba = false;

    if (capturedIds && capturedIds.length > 0) {
        const capturedCards = state.table.filter(c => capturedIds.includes(c.id));
        state.table = state.table.filter(c => !capturedIds.includes(c.id));
        state.piles[teamIdx].push(cardObj, ...capturedCards);
        state.lastCaptor = teamIdx;
        
        // RULE FIX: No Chkobba on the final card of the 40-card round
        const isFinalCard = state.deck.length === 0 && state.hands.every(h => h.length === 0);
        if (state.table.length === 0 && !isFinalCard) {
            state.chkobbas[teamIdx].push(cardObj);
            chkobba = true;
        }
    } else {
        state.table.push(cardObj);
    }
    
    state.currentTurn = (state.currentTurn + 1) % state.numPlayers;
    const allHandsEmpty = state.hands.every(h => h.length === 0);
    let newCardsDealt = false;
    let roundEnded = false;
    let results = null;
    
    if (allHandsEmpty) {
        if (state.deck.length > 0) {
            state.jaryaCount++;
            for (let p = 0; p < state.numPlayers; p++) {
                for (let i = 0; i < 3; i++) {
                    const card = state.deck.pop();
                    if (card) state.hands[p].push(card);
                }
            }
            newCardsDealt = true;
        } else {
            roundEnded = true;
            if (state.lastCaptor >= 0) {
                state.piles[state.lastCaptor].push(...state.table);
                state.table = [];
            }
            results = calculateRoundPoints(state);
            state.totalScores[0] += results.pts[0];
            state.totalScores[1] += results.pts[1];
        }
    }
    
    io.to(code).emit('move-played', {
        playerIdx: mySlotIdx,
        cardId,
        capturedIds: capturedIds || [],
        newTurn: state.currentTurn,
        newCardsDealt,
        isJaryaEnded: roundEnded,
        chkobba
    });
    
    if (newCardsDealt) {
        room.players.forEach((p, i) => {
            if (p.id) io.to(p.id).emit('deal-cards', { 
                myHand: state.hands[i],
                table: state.table,
                deckRemaining: state.deck.length,
                currentTurn: state.currentTurn,
                roundCount: room.roundCount,
                jaryaCount: state.jaryaCount,
                maxJaryas: state.maxJaryas
            });
        });
    } else if (roundEnded) {
        setTimeout(() => {
            io.to(code).emit('jarya-ended', { results, totals: state.totalScores, winScore: room.settings.score });
        }, 1200);
    }
  });

  socket.on('next-round', () => {
      const code = socket.data.code;
      const mySlotIdx = socket.data.slotIdx;
      const room = rooms[code];
      if (!room || !room.gameState) return;
      
      const state = room.gameState;
      state.readyForNextRound[mySlotIdx] = true;
      io.to(code).emit('player-ready', { playerIdx: mySlotIdx });
      
      if (state.readyForNextRound.filter(v => v === true).length >= state.numPlayers) {
          const newDeck = generateDeck();
          const newTable = [];
          for (let i = 0; i < 4; i++) newTable.push(newDeck.pop());
          const newHands = Array.from({ length: state.numPlayers }, () => []);
          for (let p = 0; p < state.numPlayers; p++) {
              for (let i = 0; i < 3; i++) newHands[p].push(newDeck.pop());
          }

          room.roundCount++;
          // REBUILD STATE BUT PRESERVE SCORES
          room.gameState = {
              ...state,
              deck: newDeck,
              table: newTable,
              hands: newHands,
              piles: [[], []],
              chkobbas: [[], []],
              lastCaptor: -1,
              jaryaCount: 1,
              readyForNextRound: Array.from({ length: state.numPlayers }, () => false),
              currentTurn: (room.roundCount % 2 === 0) ? 1 : 0 
          };

          room.players.forEach((p, i) => {
              if (p.id) io.to(p.id).emit('deal-cards', { 
                  myHand: room.gameState.hands[i],
                  table: room.gameState.table,
                  currentTurn: room.gameState.currentTurn,
                  isNewRound: true,
                  roundCount: room.roundCount,
                  jaryaCount: room.gameState.jaryaCount,
                  maxJaryas: room.gameState.maxJaryas
              });
          });
      }
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    const room = rooms[code];
    if (room) {
      if (!room.cleanupTimeout) {
          room.cleanupTimeout = setTimeout(() => {
              const anyActive = room.players.some(p => io.sockets.sockets.has(p.id));
              if (!anyActive) delete rooms[code];
          }, 30000);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🃏 Chkobba server running → http://localhost:${PORT}\n`);
});