const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const rooms = {}; // { roomName: { users: { socketId: username }, masterId } }

io.on("connection", socket => {

  socket.on("join-room", ({ username, room }) => {
    socket.join(room);
    if (!rooms[room]) rooms[room] = { users: {}, masterId: null };
    rooms[room].users[socket.id] = username;

    io.to(room).emit("room-info", `Usuários na sala ${room}: ${Object.values(rooms[room].users).join(", ")}`);
    io.to(room).emit("system-log", `${username} entrou na sala`);
  });

  socket.on("set-master", room => {
    if (!rooms[room]) return;
    rooms[room].masterId = socket.id;
    io.to(room).emit("system-log", `Usuário ${rooms[room].users[socket.id]} é o master da serial`);
  });

  /* Dados digitados por qualquer usuário */
  socket.on("serial-write", ({ room, data }) => {
    const r = rooms[room];
    if (!r) return;

    // envia para master escrever na serial física
    if (r.masterId) {
      io.to(r.masterId).emit("serial-master-write", data);
    }

    // envia para o terminal de quem digitou (eco local)
    socket.emit("serial-echo", data);
  });

  /* Dados recebidos da serial do master */
  socket.on("serial-data", ({ room, data }) => {
    if (!rooms[room]) return;

    // envia para todos os usuários da sala
    io.to(room).emit("serial-data", data);
    io.to(room).emit("console-log", `<< ${JSON.stringify(data)}`);
  });

  socket.on("disconnect", () => {
    for (const roomName in rooms) {
      if (rooms[roomName].users[socket.id]) {
        const username = rooms[roomName].users[socket.id];
        delete rooms[roomName].users[socket.id];

        if (rooms[roomName].masterId === socket.id) {
          rooms[roomName].masterId = null;
          io.to(roomName).emit("system-log", "Master da serial saiu da sala");
        }

        io.to(roomName).emit("room-info", `Usuários na sala ${roomName}: ${Object.values(rooms[roomName].users).join(", ")}`);
        io.to(roomName).emit("system-log", `${username} saiu da sala`);
      }
    }
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Multty rodando na porta", PORT);
});
