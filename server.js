import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: process.env.PORT || 8080 });

const clients = new Map(); // publicKey -> ws

wss.on("connection", ws => {
  let userKey = null;

  ws.on("message", msg => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "hello") {
        userKey = data.publicKey;
        clients.set(userKey, ws);

        ws.send(JSON.stringify({
          type: "online",
          users: [...clients.keys()]
        }));

        broadcast();
      }
    } catch {}
  });

  ws.on("close", () => {
    if (userKey) {
      clients.delete(userKey);
      broadcast();
    }
  });
});

function broadcast() {
  const users = [...clients.keys()];
  for (const ws of clients.values()) {
    ws.send(JSON.stringify({
      type: "online",
      users
    }));
  }
}

console.log("Server running");
