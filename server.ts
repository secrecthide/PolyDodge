import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Socket.io logic
  setupSocketIO(io);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.resolve(__dirname, "dist")));
    // Use regex to match all routes for SPA fallback in Express 5+
    app.get(/(.*)/, (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// --- Game Server Logic ---

interface Player {
  id: string;
  name: string;
  team: "blue" | "red" | null;
  isReady: boolean;
  score: number;
  isOut: boolean;
  stats: {
    throws: number;
    catches: number;
    blocks: number;
    eliminations: number;
  };
  wantsToPlayAgain?: boolean;
}

interface Ball {
  id: number;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  owner: string | null;
  state: "idle" | "held" | "thrown";
  isLive: boolean;
  type: "normal" | "fast" | "curve" | "lob";
  curveFactor: number;
  lastInteractionTime: number;
}

interface Room {
  id: string;
  type: "casual" | "ranked";
  players: Player[];
  balls: Ball[];
  state: "waiting" | "ready_check" | "playing" | "finished";
  timer: number;
  createdAt: number;
  blueWins: number;
  redWins: number;
  roundStartTimestamp?: number;
}

const ARENA_SIZE = 60;
const TICK_RATE = 30; // 30 ticks per second for physics
const TICK_INTERVAL = 1000 / TICK_RATE;

const rooms = new Map<string, Room>();
const playerRoomMap = new Map<string, string>();

function setupSocketIO(io: Server) {
  // Main Room Logic Loop (1s interval for timers)
  setInterval(() => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.state === "waiting") {
        if (room.players.length >= 2) {
          startLobby(io, room);
        }
      } else if (room.state === "ready_check") {
        room.timer--;
        if (room.timer <= 0) {
          startGame(io, room);
        } else {
          io.to(roomId).emit("room_update", room);
        }
      } else if (room.state === "playing") {
        // Only tick timer if round has started
        if (room.roundStartTimestamp && Date.now() >= room.roundStartTimestamp) {
          room.timer--;
          io.to(roomId).emit("timer_update", room.timer);
          if (room.timer <= 0) {
            handleRoundEnd(io, room, "draw");
          }
        }
      }
    }
  }, 1000);

  // Physics Loop (TICK_RATE interval)
  setInterval(() => {
    for (const room of rooms.values()) {
      if (room.state === "playing") {
        // Only update physics if round has started
        if (room.roundStartTimestamp && Date.now() >= room.roundStartTimestamp) {
          updateRoomPhysics(io, room);
        }
      }
    }
  }, TICK_INTERVAL);

  io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    socket.on("join_matchmaking", ({ name, type }: { name: string, type: "casual" | "ranked" }) => {
      // Find an available room or create a new one
      let joinedRoom: Room | null = null;
      for (const room of rooms.values()) {
        if (room.type === type && (room.state === "waiting" || room.state === "ready_check") && room.players.length < 8) {
          joinedRoom = room;
          break;
        }
      }

      if (!joinedRoom) {
        joinedRoom = {
          id: Math.random().toString(36).substring(2, 9),
          type,
          players: [],
          balls: [],
          state: "waiting",
          timer: 0,
          createdAt: Date.now(),
          blueWins: 0,
          redWins: 0
        };
        rooms.set(joinedRoom.id, joinedRoom);
      }

      // Assign team
      const blueCount = joinedRoom.players.filter(p => p.team === "blue").length;
      const redCount = joinedRoom.players.filter(p => p.team === "red").length;
      const team = blueCount <= redCount ? "blue" : "red";

      // Handle duplicate names
      let finalName = name || "Player";
      const existingNames = joinedRoom.players.map(p => p.name);
      let count = 1;
      while (existingNames.includes(finalName)) {
        finalName = `${name || "Player"} (${count++})`;
      }

      const newPlayer: Player = {
        id: socket.id,
        name: finalName,
        team,
        isReady: false,
        score: 0,
        isOut: false,
        stats: {
          throws: 0,
          catches: 0,
          blocks: 0,
          eliminations: 0
        }
      };

      joinedRoom.players.push(newPlayer);
      playerRoomMap.set(socket.id, joinedRoom.id);
      socket.join(joinedRoom.id);

      // If room is already in ready_check, new player starts as not ready
      if (joinedRoom.state === "ready_check") {
        newPlayer.isReady = false;
      }

      io.to(joinedRoom.id).emit("room_update", joinedRoom);
    });

    socket.on("leave_matchmaking", () => {
      leaveRoom(io, socket);
    });

    socket.on("disconnect", () => {
      leaveRoom(io, socket);
      console.log("Player disconnected:", socket.id);
    });
    
    // In-game events
    socket.on("player_move", (data) => {
      const roomId = playerRoomMap.get(socket.id);
      if (roomId) {
        // Broadcast to others in room
        socket.to(roomId).emit("player_moved", { id: socket.id, ...data });
      }
    });
    
    socket.on("ball_throw", (data) => {
      const roomId = playerRoomMap.get(socket.id);
      if (roomId) {
        const room = rooms.get(roomId);
        if (room && room.state === "playing") {
          const ballId = Number(data.ballId);
          const ball = room.balls.find(b => b.id === ballId);
          if (ball && ball.owner === socket.id) {
            ball.state = "thrown";
            ball.isLive = true;
            ball.position = data.position;
            ball.velocity = data.velocity;
            ball.type = data.type || "normal";
            ball.curveFactor = data.curveFactor || 0;
            ball.lastInteractionTime = Date.now();
            
            const player = room.players.find(p => p.id === socket.id);
            if (player) player.stats.throws++;

            io.to(roomId).emit("ball_thrown", { id: socket.id, ...data, ballId });
          }
        }
      }
    });

    socket.on("ball_grab", (data) => {
      const roomId = playerRoomMap.get(socket.id);
      if (roomId) {
        const room = rooms.get(roomId);
        if (room && room.state === "playing") {
          const ballId = Number(data.ballId);
          const ball = room.balls.find(b => b.id === ballId);
          if (ball && (ball.state === "idle" || ball.state === "thrown")) {
            const isCatch = ball.state === "thrown" && ball.isLive;
            
            // Check if player already holding a ball
            const alreadyHolding = room.balls.find(b => b.owner === socket.id && b.state === "held");
            if (!alreadyHolding) {
              ball.state = "held";
              ball.owner = socket.id;
              ball.isLive = false;
              ball.velocity = { x: 0, y: 0, z: 0 };
              ball.lastInteractionTime = Date.now();

              const player = room.players.find(p => p.id === socket.id);
              if (player && isCatch) player.stats.catches++;

              io.to(roomId).emit("ball_grabbed", { id: socket.id, ballId, isCatch });
            }
          }
        }
      }
    });

    socket.on("player_hit", (data) => {
      const roomId = playerRoomMap.get(socket.id);
      if (roomId) {
        const room = rooms.get(roomId);
        if (room) {
          const target = room.players.find(p => p.id === data.targetId);
          if (target && !target.isOut) {
            target.isOut = true;
            
            const shooter = room.players.find(p => p.id === socket.id);
            if (shooter) shooter.stats.eliminations++;

            io.to(roomId).emit("player_eliminated", { 
              targetId: data.targetId, 
              shooterId: socket.id,
              hitPosition: data.hitPosition 
            });
            
            // Check round win condition
            const activeBlue = room.players.filter(p => p.team === "blue" && !p.isOut).length;
            const activeRed = room.players.filter(p => p.team === "red" && !p.isOut).length;
            
            if (activeBlue === 0 || activeRed === 0) {
              let winner = "draw";
              if (activeBlue > activeRed) winner = "blue";
              else if (activeRed > activeBlue) winner = "red";
              
              handleRoundEnd(io, room, winner);
            }
          }
        }
      }
    });

    socket.on("player_emote", (data) => {
      const roomId = playerRoomMap.get(socket.id);
      if (roomId) {
        socket.to(roomId).emit("player_emote", { id: socket.id, emote: data.emote });
      }
    });

    socket.on("chat_message", (data: { text: string, channel: "team" | "all" }) => {
      const roomId = playerRoomMap.get(socket.id);
      if (roomId) {
        const room = rooms.get(roomId);
        if (room) {
          const player = room.players.find(p => p.id === socket.id);
          if (player) {
            const message = {
              id: Math.random().toString(36).substring(7),
              senderId: socket.id,
              senderName: player.name,
              senderTeam: player.team,
              text: data.text,
              channel: data.channel,
              timestamp: Date.now()
            };

            if (data.channel === "all") {
              io.to(roomId).emit("chat_message", message);
            } else {
              // Team only
              room.players.forEach(p => {
                if (p.team === player.team) {
                  io.to(p.id).emit("chat_message", message);
                }
              });
            }
          }
        }
      }
    });

    socket.on("voice_signal", (data: { targetId: string, signal: any }) => {
      io.to(data.targetId).emit("voice_signal", { senderId: socket.id, signal: data.signal });
    });

    socket.on("player_block", () => {
      const roomId = playerRoomMap.get(socket.id);
      if (roomId) {
        const room = rooms.get(roomId);
        if (room) {
          const player = room.players.find(p => p.id === socket.id);
          if (player) player.stats.blocks++;
          io.to(roomId).emit("player_blocked_ball", { id: socket.id });
        }
      }
    });

    socket.on("play_again_vote", (vote: boolean) => {
      const roomId = playerRoomMap.get(socket.id);
      if (roomId) {
        const room = rooms.get(roomId);
        if (room && room.state === "finished" && room.type === "casual") {
          const player = room.players.find(p => p.id === socket.id);
          if (player) {
            player.wantsToPlayAgain = vote;
            io.to(roomId).emit("room_update", room);

            // Check if all players agreed
            const allAgreed = room.players.every(p => p.wantsToPlayAgain);
            if (allAgreed) {
              // Reset wins and start again
              room.blueWins = 0;
              room.redWins = 0;
              room.players.forEach(p => {
                p.stats = { throws: 0, catches: 0, blocks: 0, eliminations: 0 };
                p.wantsToPlayAgain = false;
              });
              startGame(io, room);
            }
          }
        }
      }
    });
  });
}

function leaveRoom(io: Server, socket: any) {
  const roomId = playerRoomMap.get(socket.id);
  if (roomId) {
    const room = rooms.get(roomId);
    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        io.to(roomId).emit("chat_message", {
          id: Math.random().toString(36).substring(7),
          senderId: "system",
          senderName: "SYSTEM",
          senderTeam: null,
          text: `${player.name} has left the arena.`,
          channel: "all",
          timestamp: Date.now()
        });
      }

      // Remove player from array
      room.players = room.players.filter(p => p.id !== socket.id);
      socket.leave(roomId);
      playerRoomMap.delete(socket.id);
      
      // Notify others that player left
      io.to(roomId).emit("player_left", { id: socket.id });

      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else {
        // Check if a whole team left
        const bluePlayers = room.players.filter(p => p.team === "blue");
        const redPlayers = room.players.filter(p => p.team === "red");

        if (room.state === "playing") {
          if (bluePlayers.length === 0) {
            room.redWins = 4;
            handleRoundEnd(io, room, "red");
            return;
          }
          if (redPlayers.length === 0) {
            room.blueWins = 4;
            handleRoundEnd(io, room, "blue");
            return;
          }
        }

        if (room.state === "ready_check" && room.players.length < 2) {
          room.state = "waiting";
        }
        
        // If game is in progress, check if this leave ends the round
        if (room.state === "playing") {
          const activeBlue = room.players.filter(p => p.team === "blue" && !p.isOut).length;
          const activeRed = room.players.filter(p => p.team === "red" && !p.isOut).length;
          
          if (activeBlue === 0 || activeRed === 0) {
            let winner = "draw";
            if (activeBlue > activeRed) winner = "blue";
            else if (activeRed > activeBlue) winner = "red";
            
            handleRoundEnd(io, room, winner);
          }
        }

        // If game is finished, check if remaining players all voted yes
        if (room.state === "finished" && room.type === "casual" && room.players.length >= 2) {
          const allAgreed = room.players.every(p => p.wantsToPlayAgain);
          if (allAgreed) {
            room.blueWins = 0;
            room.redWins = 0;
            room.players.forEach(p => {
              p.stats = { throws: 0, catches: 0, blocks: 0, eliminations: 0 };
              p.wantsToPlayAgain = false;
            });
            startGame(io, room);
          }
        }
        
        io.to(roomId).emit("room_update", room);
      }
    }
  }
}

function startLobby(io: Server, room: Room) {
  if (room.state === "ready_check") return; // Already in lobby
  room.state = "ready_check";
  room.timer = 45; // 45 seconds lobby countdown
  room.players.forEach(p => p.isReady = false);
  room.blueWins = 0;
  room.redWins = 0;
  io.to(room.id).emit("room_update", room);
}

function startGame(io: Server, room: Room) {
  room.state = "playing";
  room.timer = 180;
  room.roundStartTimestamp = Date.now() + 3000; // 3 seconds countdown
  room.players.forEach(p => p.isOut = false);
  
  // Initialize balls
  room.balls = [];
  for (let i = 0; i < 8; i++) {
    room.balls.push({
      id: i,
      position: { x: (i - 3.5) * 6, y: 0.3, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      owner: null,
      state: "idle",
      isLive: false,
      type: "normal",
      curveFactor: 0,
      lastInteractionTime: Date.now()
    });
  }
  
  io.to(room.id).emit("game_start", { ...room, serverTime: Date.now() });
}

function handleRoundEnd(io: Server, room: Room, winner: string) {
  if (winner === "blue") room.blueWins++;
  if (winner === "red") room.redWins++;
  
  io.to(room.id).emit("round_over", { winner, blueWins: room.blueWins, redWins: room.redWins });

  // Check Match Win (First to 4)
  if (room.blueWins >= 4 || room.redWins >= 4) {
    room.state = "finished"; // Or "MATCH_COMPLETE" if you want to be strict with the user request, but "finished" is used elsewhere. I'll stick to "finished" for state but emit MATCH_COMPLETE.
    const winner = room.blueWins >= 4 ? "blue" : "red";
    
    io.to(room.id).emit("MATCH_COMPLETE", { 
      winner, 
      scoreboard: room.players.map(p => ({
        id: p.id,
        name: p.name,
        team: p.team,
        stats: p.stats
      }))
    });
    
    finishGame(io, room, winner);
  } else {
    // Start next round after delay
    setTimeout(() => {
      startGame(io, room);
    }, 5000);
  }
}

function finishGame(io: Server, room: Room, winner: string) {
  room.state = "finished";
  io.to(room.id).emit("game_over", { 
    winner, 
    scoreboard: room.players.map(p => ({
      id: p.id,
      name: p.name,
      team: p.team,
      stats: p.stats
    }))
  });
  
  // Clean up room after a delay if it's ranked or if they don't vote
  if (room.type === "ranked") {
    setTimeout(() => {
      if (rooms.has(room.id)) {
        io.to(room.id).emit("kicked", "Match ended.");
        room.players.forEach(p => {
          io.sockets.sockets.get(p.id)?.leave(room.id);
          playerRoomMap.delete(p.id);
        });
        rooms.delete(room.id);
      }
    }, 10000);
  } else {
    // Casual: Give more time to vote
    setTimeout(() => {
      if (rooms.has(room.id) && room.state === "finished") {
        io.to(room.id).emit("kicked", "Match ended.");
        room.players.forEach(p => {
          io.sockets.sockets.get(p.id)?.leave(room.id);
          playerRoomMap.delete(p.id);
        });
        rooms.delete(room.id);
      }
    }, 30000);
  }
}

function updateRoomPhysics(io: Server, room: Room) {
  const delta = TICK_INTERVAL / 1000;
  let ballsUpdated = false;

  room.balls.forEach(ball => {
    if (ball.state === "thrown" || ball.state === "idle") {
      // Apply velocity
      ball.position.x += ball.velocity.x * delta;
      ball.position.y += ball.velocity.y * delta;
      ball.position.z += ball.velocity.z * delta;

      // Gravity
      if (ball.position.y > 0.3) {
        let gravity = 15;
        if (ball.type === "lob") gravity = 8;
        ball.velocity.y -= gravity * delta;
      }

      // Floor collision
      if (ball.position.y < 0.3) {
        ball.position.y = 0.3;
        if (ball.isLive) {
          ball.isLive = false;
          ball.owner = null;
          ball.state = "idle";
        }
        ball.velocity.y *= -0.6;
        ball.velocity.x *= 0.95;
        ball.velocity.z *= 0.95;
      }

      // Wall collision
      const limit = ARENA_SIZE / 2 - 0.5;
      if (Math.abs(ball.position.x) > limit) {
        ball.position.x = Math.sign(ball.position.x) * limit;
        ball.velocity.x *= -0.6;
        ball.isLive = false;
      }
      if (Math.abs(ball.position.z) > limit) {
        ball.position.z = Math.sign(ball.position.z) * limit;
        ball.velocity.z *= -0.6;
        ball.isLive = false;
      }

      // Stop if slow
      if (Math.abs(ball.velocity.x) < 0.1 && Math.abs(ball.velocity.z) < 0.1 && ball.position.y <= 0.31) {
        ball.velocity.x = 0;
        ball.velocity.z = 0;
        ball.velocity.y = 0;
      }
      
      ballsUpdated = true;
    }
  });

  if (ballsUpdated) {
    io.to(room.id).emit("balls_update", room.balls.map(b => ({
      id: b.id,
      position: b.position,
      velocity: b.velocity,
      state: b.state,
      isLive: b.isLive
    })));
  }
}

startServer();
