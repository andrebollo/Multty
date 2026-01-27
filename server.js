const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

/* ==========================
   REDIS
========================== */
const pubClient = createClient({
  url: process.env.REDIS_URL
});
const subClient = pubClient.duplicate();

(async () => {
  await pubClient.connect();
  await subClient.connect();
  io.adapter(createAdapter(pubClient, subClient));
  console.log("Redis conectado");
})();

/* ==========================
   ESTADO DAS SALAS
========================== */
const rooms = {};
// rooms[room] = { serialOwner: socket.id, serialUser: username }

/* ==========================
   SOCKET.IO
========================== */
io.on("connection", socket => {
  let currentRoom = null;
  let username = "Anônimo";

  socket.on("join-room", ({ room, user }) => {
    currentRoom = room;
    username = user || "Anônimo";

    socket.join(room);

    if (!rooms[room]) {
      rooms[room] = {
        serialOwner: null,
        serialUser: null
      };
    }

    // envia estado atual da serial para quem entrou
    io.to(room).emit("serial-status", {
      connected: !!rooms[room].serialOwner,
      user: rooms[room].serialUser
    });

    io.to(room).emit("system", `${username} entrou na sala`);
  });

  /* ===== CONECTAR SERIAL ===== */
  socket.on("serial-connect", () => {
    if (!currentRoom) return;

    if (rooms[currentRoom].serialOwner) return;

    rooms[currentRoom].serialOwner = socket.id;
    rooms[currentRoom].serialUser = username;

    io.to(currentRoom).emit("serial-status", {
      connected: true,
      user: username
    });

    io.to(currentRoom).emit(
      "system",
      `Serial conectada por ${username}`
    );
  });

  /* ===== DADOS DIGITADOS ===== */
  socket.on("serial-write", data => {
    if (!currentRoom) return;

    const owner = rooms[currentRoom].serialOwner;
    if (!owner) return;

    io.to(owner).emit("serial-tx", data);
    socket.to(currentRoom).emit("terminal", data);
  });

  /* ===== DADOS VINDOS DA SERIAL ===== */
  socket.on("serial-rx", data => {
    if (!currentRoom) return;
    io.to(currentRoom).emit("terminal", data);
  });

  socket.on("disconnect", () => {
    if (!currentRoom) return;

    if (rooms[currentRoom].serialOwner === socket.id) {
      rooms[currentRoom].serialOwner = null;
      rooms[currentRoom].serialUser = null;

      io.to(currentRoom).emit("serial-status", {
        connected: false,
        user: null
      });

      io.to(currentRoom).emit("system", "Serial desconectada");
    }

    io.to(currentRoom).emit(
      "system",
      `${username} saiu`
    );
  });
});

/* ==========================
   SERVER
========================== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});
