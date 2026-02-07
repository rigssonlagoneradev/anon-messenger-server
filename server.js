import { WebSocketServer } from "ws";
import fs from "fs";

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

const clients = new Map();        // userId -> ws
const QUEUE_FILE = "./queue.json";
let messageQueue = {};

// Load persisted queue
if (fs.existsSync(QUEUE_FILE)) {
  try {
    messageQueue = JSON.parse(fs.readFileSync(QUEUE_FILE));
  } catch {
    messageQueue = {};
  }
}

function persistQueue() {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(messageQueue));
}

wss.on("connection", ws => {
  let userId = null;

  ws.on("message", msg => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    // User online
    if (data.type === "hello") {
      userId = data.publicKey;
      clients.set(userId, ws);

      // Deliver queued messages
      if (messageQueue[userId]) {
        messageQueue[userId].forEach(m => {
          ws.send(JSON.stringify({
            type: "relay",
            from: m.from,
            payload: m.payload
          }));
        });
        delete messageQueue[userId];
        persistQueue();
      }

      broadcastOnline();
    }

    // Relay message
    if (data.type === "relay") {
      const { to, payload } = data;

      if (clients.has(to)) {
        clients.get(to).send(JSON.stringify({
          type: "relay",
          from: userId,
          payload
        }));
      } else {
        // Queue offline
        if (!messageQueue[to]) messageQueue[to] = [];
        messageQueue[to].push({ from: userId, payload });
        persistQueue();
      }
    }
  });

  ws.on("close", () => {
    if (userId) {
      clients.delete(userId);
      broadcastOnline();
    }
  });
});

function broadcastOnline() {
  const users = [...clients.keys()];
  clients.forEach(ws => {
    ws.send(JSON.stringify({ type: "online", users }));
  });
}

console.log("Server running on", PORT);
