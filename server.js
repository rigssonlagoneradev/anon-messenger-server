import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: process.env.PORT || 8080 });
const clients = new Map(); // publicKey -> ws

wss.on("connection", ws => {
  let userKey = null;

  ws.on("message", msg => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    // User comes online
    if (data.type === "hello") {
      userKey = data.publicKey;
      clients.set(userKey, ws);
      broadcastOnline();
    }

    // Relay request / accept / reject
    if (data.type === "relay" && clients.has(data.to)) {
      clients.get(data.to).send(JSON.stringify({
        type: "relay",
        from: userKey,
        payload: data.payload
      }));
    }
  });

  ws.on("close", () => {
    if (userKey) {
      clients.delete(userKey);
      broadcastOnline();
    }
  });
});

function broadcastOnline() {
  const users = [...clients.keys()];
  for (const ws of clients.values()) {
    ws.send(JSON.stringify({
      type: "online",
      users
    }));
  }
}

console.log("Server running");
