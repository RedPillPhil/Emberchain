/**
 * Embermon MMO routes
 * POST /api/mmo/ai-chat  — AI NPC dialogue (rate-limited per IP)
 * GET  /api/mmo/players  — list currently online players
 * WS   /api/mmo/ws       — real-time position sync
 */

import { Router } from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";

const router = Router();

// ── In-memory player state ─────────────────────────────────────────────────────
interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  dir: number;
  mapId: number;
  charFile: string;
  charIndex: number;
  hairColor: string;
  shirtColor: string;
  lastSeen: number;
}

const players = new Map<string, PlayerState>();
const sockets = new Map<string, WebSocket>();

// Clean up stale players every 30 s
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [id, p] of players) {
    if (p.lastSeen < cutoff) {
      players.delete(id);
      sockets.delete(id);
    }
  }
}, 30_000);

// ── REST: list online players ──────────────────────────────────────────────────
router.get("/players", (_req, res) => {
  const now = Date.now();
  const online = Array.from(players.values()).filter(p => now - p.lastSeen < 60_000);
  res.json({ players: online, count: online.length });
});

// ── REST: AI NPC chat ──────────────────────────────────────────────────────────
// Simple contextual response engine — no external API key needed.
// Upgrade: swap generateReply for a real LLM call when an API key is available.

interface NpcChatRequest {
  npcName: string;
  mood?: string;
  playerName?: string;
  location?: string;
}

const NPC_LINES: Record<string, string[]> = {
  Professor: [
    "The Wasteland has evolved strange creatures. We call them Embermon.",
    "Some species only appear at night. Keep exploring after dark.",
    "Your first catch is always the hardest. Use every advantage you have.",
    "An Embrat's fire glands contain pure combustible plasma. Fascinating.",
    "According to my research, Voidmaw hasn't been seen in a decade.",
    "Each Embermon carries a unique radiation signature. That's how we track them.",
  ],
  Survivor: [
    "I haven't seen another person in six months. You're a welcome sight.",
    "The sandstorms come from the east. Head west if you need shelter.",
    "I lost my Thunderfang last winter. I still hear it sometimes.",
    "The trading post two klicks north has Emberballs. If it's still standing.",
    "Don't trust the water near the old reactor. The Mudrakes there are... wrong.",
    "Keep your Embermon well-fed or they'll wander. Learned that the hard way.",
  ],
  Trainer: [
    "You carry yourself like someone who's seen real battles. Prove it.",
    "My Blazeclaw was bred for endurance. Yours won't last a minute.",
    "Interesting team. Not what I expected from a newcomer.",
    "You beat me fair. I respect that. Train hard.",
    "Out here, a strong Embermon is worth more than caps.",
    "Come back when you've caught a Voidmaw. Then we'll talk.",
  ],
  _default: [
    "The wastes are dangerous. Stay sharp.",
    "I've nothing useful to say today.",
    "Keep moving. Staying still gets you killed out here.",
    "You're not from around here, are you.",
    "Watch the skyline at dusk. That's when they come out.",
  ],
};

function generateReply(req: NpcChatRequest): string {
  const lines = NPC_LINES[req.npcName] ?? NPC_LINES["_default"]!;
  const base = lines[Math.floor(Math.random() * lines.length)]!;

  // Personalize with player name occasionally
  if (req.playerName && Math.random() > 0.6) {
    const salutations = ["Listen", "Hey", "Remember this"];
    return salutations[Math.floor(Math.random() * salutations.length)] + ", " + req.playerName + ". " + base;
  }
  return base;
}

// Simple IP-based rate limiting: max 5 AI calls per IP per hour
const ipUsage = new Map<string, { count: number; resetAt: number }>();

router.post("/ai-chat", (req, res) => {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const hourMs = 3_600_000;

  let usage = ipUsage.get(ip);
  if (!usage || usage.resetAt < now) {
    usage = { count: 0, resetAt: now + hourMs };
    ipUsage.set(ip, usage);
  }

  if (usage.count >= 20) {
    return res.json({ reply: "...", quota_exceeded: true });
  }
  usage.count++;

  const body: NpcChatRequest = req.body ?? {};
  const reply = generateReply(body);

  res.json({ reply, remaining: 20 - usage.count });
});

// ── WebSocket MMO server ───────────────────────────────────────────────────────
export function setupMmoWS(server: http.Server) {
  const wss = new WebSocketServer({ server, path: "/api/mmo/ws" });

  wss.on("connection", (ws) => {
    let playerId: string | null = null;

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "state" && msg.id) {
          playerId = msg.id;
          const state: PlayerState = {
            id:         msg.id,
            name:       (msg.name ?? "Traveler").slice(0, 20),
            x:          Number(msg.x) || 0,
            y:          Number(msg.y) || 0,
            dir:        Number(msg.dir) || 2,
            mapId:      Number(msg.mapId) || 1,
            charFile:   msg.charFile ?? "Actor1",
            charIndex:  Number(msg.charIndex) || 0,
            hairColor:  msg.hairColor ?? "#1a1a1a",
            shirtColor: msg.shirtColor ?? "#c0392b",
            lastSeen:   Date.now(),
          };
          players.set(playerId, state);
          sockets.set(playerId, ws);

          // Broadcast this player's state to everyone else on same map
          for (const [otherId, otherWs] of sockets) {
            if (otherId !== playerId && otherWs.readyState === WebSocket.OPEN) {
              const otherState = players.get(otherId);
              if (otherState && otherState.mapId === state.mapId) {
                otherWs.send(JSON.stringify({ ...state, type: "state" }));
              }
            }
          }

          // Send this player the current state of everyone else on the same map
          for (const [otherId, otherState] of players) {
            if (otherId !== playerId && otherState.mapId === state.mapId) {
              const now2 = Date.now();
              if (now2 - otherState.lastSeen < 60_000) {
                ws.send(JSON.stringify({ ...otherState, type: "state" }));
              }
            }
          }
        }

        if (msg.type === "leave" && msg.id) {
          broadcastLeave(msg.id);
          players.delete(msg.id);
          sockets.delete(msg.id);
        }

        if (msg.type === "pong") { /* heartbeat */ }
      } catch { /* ignore parse errors */ }
    });

    ws.on("close", () => {
      if (playerId) {
        broadcastLeave(playerId);
        players.delete(playerId);
        sockets.delete(playerId);
      }
    });

    // Ping every 30s to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      } else {
        clearInterval(pingInterval);
      }
    }, 30_000);
  });
}

function broadcastLeave(id: string) {
  const leaveMsg = JSON.stringify({ type: "leave", id });
  for (const [otherId, ws] of sockets) {
    if (otherId !== id && ws.readyState === WebSocket.OPEN) {
      ws.send(leaveMsg);
    }
  }
}

export default router;
