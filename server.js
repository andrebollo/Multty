const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ======================
   STATIC
====================== */
app.use(express.static(__dirname));

/* ======================
   REDIS (RENDER SAFE)
====================== */
const pubClient = createClient({
  url: process.env.REDIS_URL
});

const subClient = pubClient.duplicate();

/* ⚠️ NUNCA deixe Redis sem handler de erro */
pubClient.on("error", err => {
  console.error("Redis PUB error:", err.message);
});

subClient.on("error", err => {
  console.error("Redis SUB error:", err.message);
});

(async () => {
  await pubClient.connect();
  await subClient.connect();

  io.adapter(createAdapter(pubClient, subClient));
  console.log("Redis adapter conectado");
})();

/* ======================
   ESTADO DAS SALAS
====================== */
/*
rooms = {
  sala1: {
    users: Map(socket.id -> username),
    serialOwner: socket.id | null
  }
}
*/
const rooms = {};

/* ======================
   SOCKET.IO
====================== */
io.on("connection", socket => {
  let currentRoom = null;
  let username = null;

  /* ===== ENTRAR NA SALA ===== */
  socket.on("join-room", ({ room, user }) => {
    currentRoom = room;
    username = user;

    socket.join(room);

    if (!rooms[room]) {
      rooms[room] = {
        users: new Map(),
        serialOwner: null
      };
    }

    rooms[room].users.set(socket.id, username);

    io.to(room).emit("room-info", {
      users: [...rooms[room].users.values()],
      serialOwner: rooms[room].serialOwner
        ? rooms[room].users.get(rooms[room].serialOwner)
        : null
    });
  });

  /* ===== SERIAL OPEN (BROWSER API OWNER) ===== */
  socket.on("serial-owner", () => {
    if (!currentRoom) return;

    if (rooms[currentRoom].serialOwner) {
      socket.emit("serial-denied");
      return;
    }

    rooms[currentRoom].serialOwner = socket.id;

    io.to(currentRoom).emit("serial-status", {
      owner: username
    });
  });

  /* ===== DADOS DA SERIAL (VINDOS DO BROWSER) ===== */
  socket.on("serial-rx", data => {
    if (!currentRoom) return;

    /* broadcast puro, sem eco local */
    socket.to(currentRoom).emit("serial-data", data);
  });

  /* ===== DADOS PARA SERIAL ===== */
  socket.on("serial-tx", data => {
    if (!currentRoom) return;
    if (rooms[currentRoom].serialOwner !== socket.id) return;

    /* envia para todos (inclusive owner) */
    io.to(currentRoom).emit("serial-write", data);
  });

  /* ===== SAÍDA ===== */
  socket.on("disconnect", () => {
    if (!currentRoom || !rooms[currentRoom]) return;

    rooms[currentRoom].users.delete(socket.id);

    /* se quem saiu era dono da serial */
    if (rooms[currentRoom].serialOwner === socket.id) {
      rooms[currentRoom].serialOwner = null;

      io.to(currentRoom).emit("serial-status", {
        owner: null
      });
    }

    io.to(currentRoom).emit("room-info", {
      users: [...rooms[currentRoom].users.values()],
      serialOwner: rooms[currentRoom].serialOwner
        ? rooms[currentRoom].users.get(rooms[currentRoom].serialOwner)
        : null
    });

    /* limpa sala vazia */
    if (rooms[currentRoom].users.size === 0) {
      delete rooms[currentRoom];
    }
  });
});

/* ======================
   SERVER
====================== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Multty rodando na porta ${PORT}`);
});
