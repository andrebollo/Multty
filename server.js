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
   REDIS (OBRIGATÓRIO EM PROD)
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
   ESTADO POR SALA
========================== */
const rooms = {}; 
// rooms[sala] = { serialOwner: socket.id }

/* ==========================
   SOCKET.IO
========================== */
io.on("connection", socket => {
  let currentRoom = null;
  let username = "Anônimo";

  socket.on("join-room", ({ room, user }) => {
    username = user || "Anônimo";
    currentRoom = room;

    socket.join(room);

    if (!rooms[room]) {
      rooms[room] = { serialOwner: null };
    }

    io.to(room).emit("system", `${username} entrou na sala`);
  });

  /* ===== USUÁRIO CONECTA A SERIAL ===== */
  socket.on("serial-connect", room => {
    if (!rooms[room]) return;

    rooms[room].serialOwner = socket.id;

    io.to(room).emit(
      "system",
      `${username} conectou a serial`
    );
  });

  /* ===== DADOS DIGITADOS ===== */
  socket.on("serial-write", data => {
    if (!currentRoom) return;

    const owner = rooms[currentRoom]?.serialOwner;

    if (!owner) return;

    // envia apenas para quem tem a serial aberta
    io.to(owner).emit("serial-tx", data);

    // mostra no terminal de todos (uma vez só)
    socket.to(currentRoom).emit("terminal", data);
  });

  /* ===== DADOS VINDOS DA SERIAL ===== */
  socket.on("serial-rx", data => {
    if (!currentRoom) return;

    io.to(currentRoom).emit("terminal", data);
  });

  socket.on("disconnect", () => {
    if (!currentRoom) return;

    if (rooms[currentRoom]?.serialOwner === socket.id) {
      rooms[currentRoom].serialOwner = null;
      io.to(currentRoom).emit(
        "system",
        "Serial desconectada"
      );
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
