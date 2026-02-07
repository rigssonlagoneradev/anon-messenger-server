import express from "express";
import http from "http";
import WebSocket from "ws";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pg from "pg";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* ===== CONFIG ===== */
const JWT_SECRET = process.env.JWT_SECRET;
const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });

/* ===== AUTH API ===== */

// CREATE ACCOUNT
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).end();

  const hash = await bcrypt.hash(password, 10);
  const id = crypto.randomUUID();

  try {
    await db.query(
      "INSERT INTO users (id, username, password_hash) VALUES ($1,$2,$3)",
      [id, username, hash]
    );
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: "Username taken" });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const q = await db.query(
    "SELECT * FROM users WHERE username=$1",
    [username]
  );
  if (!q.rows[0]) return res.status(401).end();

  const ok = await bcrypt.compare(password, q.rows[0].password_hash);
  if (!ok) return res.status(401).end();

  const token = jwt.sign({ id: q.rows[0].id }, JWT_SECRET);
  res.json({ token, profile: { username, avatar: q.rows[0].avatar_url } });
});

// UPDATE PROFILE
app.post("/profile", async (req, res) => {
  const { token, avatar } = req.body;
  const { id } = jwt.verify(token, JWT_SECRET);
  await db.query("UPDATE users SET avatar_url=$1 WHERE id=$2", [avatar, id]);
  res.json({ ok: true });
});

/* ===== WEBSOCKET ===== */
const clients = new Map();

wss.on("connection", ws => {
  ws.on("message", async msg => {
    const data = JSON.parse(msg);

    if (data.type === "hello") {
      const { id } = jwt.verify(data.token, JWT_SECRET);
      const q = await db.query("SELECT username, avatar_url FROM users WHERE id=$1", [id]);
      ws.user = { id, profile: q.rows[0] };
      clients.set(id, ws);
      broadcastOnline();
    }

    if (data.type === "relay") {
      const to = clients.get(data.to);
      if (to) {
        to.send(JSON.stringify({
          type: "relay",
          from: ws.user.id,
          payload: data.payload
        }));
      }
    }
  });

  ws.on("close", () => {
    if (ws.user) clients.delete(ws.user.id);
    broadcastOnline();
  });
});

function broadcastOnline() {
  const users = [...clients.values()].map(ws => ({
    id: ws.user.id,
    profile: ws.user.profile
  }));
  clients.forEach(ws => ws.send(JSON.stringify({ type: "online", users })));
}

server.listen(process.env.PORT);
