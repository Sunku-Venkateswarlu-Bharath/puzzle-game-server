const WebSocket = require("ws");

const PORT = process.env.PORT || 3001;
const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`WebSocket server running on ws://0.0.0.0:${PORT}`);
});

/**
 * Structure:
 * {
 *   [roomId]: {
 *     clients: Set<WebSocket>,
 *     puzzleState: { pieces: [...] },
 *     players: [{ id, name, avatar, score, online }]
 *   }
 * }
 */
const rooms = {};

function broadcast(roomId, data) {
  if (!rooms[roomId]) return;
  for (const client of rooms[roomId].clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }
}

wss.on("connection", (ws) => {
  let currentRoom = null;
  let player = null;

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    // Handle join
    if (data.type === "join") {
      currentRoom = data.roomId || "default";
      if (!rooms[currentRoom]) {
        rooms[currentRoom] = {
          clients: new Set(),
          puzzleState: { pieces: [] },
          players: [],
        };
      }
      rooms[currentRoom].clients.add(ws);

      // Add player to room's player list
      player = {
        id: data.playerId,
        name: data.playerName,
        avatar: `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(data.playerName)}`,
        score: 0,
        online: true,
      };
      // Remove any existing player with same id
      rooms[currentRoom].players = rooms[currentRoom].players.filter(
        (p) => p.id !== player.id
      );
      rooms[currentRoom].players.push(player);

      // Send current puzzle state to new client
      ws.send(
        JSON.stringify({
          type: "puzzle_state",
          pieces: rooms[currentRoom].puzzleState.pieces,
          gameState: {}, // Optionally send more game state
        })
      );
      // Broadcast updated player list
      broadcast(currentRoom, {
        type: "players",
        players: rooms[currentRoom].players,
      });
      return;
    }

    // Handle piece move
    if (data.type === "piece_move") {
      if (!currentRoom) return;
      rooms[currentRoom].puzzleState.pieces = data.pieces;
      broadcast(currentRoom, {
        type: "piece_move",
        pieces: data.pieces,
      });
      return;
    }

    // Handle chat message
    if (data.type === "chat_message") {
      if (!currentRoom) return;
      broadcast(currentRoom, {
        type: "chat_message",
        message: {
          id: Math.random().toString(36).substr(2, 9),
          player: data.playerName,
          playerId: data.playerId,
          message: data.message,
          timestamp: data.timestamp,
          type: "message",
        },
      });
      return;
    }

    // Handle initial puzzle state from the first player
    if (data.type === "init_puzzle") {
      if (!currentRoom) return;
      rooms[currentRoom].puzzleState.pieces = data.pieces;
      broadcast(currentRoom, {
        type: "puzzle_state",
        pieces: data.pieces,
        gameState: {}, // Optionally send more game state
      });
      return;
    }
  });

  ws.on("close", () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].clients.delete(ws);
      if (player) {
        // Mark player offline
        rooms[currentRoom].players = rooms[currentRoom].players.map((p) =>
          p.id === player.id ? { ...p, online: false } : p
        );
        broadcast(currentRoom, {
          type: "players",
          players: rooms[currentRoom].players,
        });
      }
      // Optionally clean up empty rooms
      if (rooms[currentRoom].clients.size === 0) {
        delete rooms[currentRoom];
      }
    }
  });
});

console.log(`WebSocket server running on ws://0.0.0.0:${PORT}`);