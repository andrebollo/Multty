const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const redis = require('redis');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Instanciando o IO com suporte a CORS para evitar bloqueios no navegador
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Configuração do Redis para o Render
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const client = redis.createClient({ url: redisUrl });

client.on('error', (err) => console.error('Erro no Cliente Redis:', err));

async function startServer() {
    await client.connect();
    console.log('Conectado ao Redis!');

    app.use(express.static(__dirname));

    io.on('connection', (socket) => {
        let currentRoom = null;

        socket.on('join-room', async ({ room, user }) => {
            currentRoom = room;
            socket.join(room);
            
            const screenState = await client.get(`terminal:${room}:data`);
            socket.emit('terminal-init', screenState || "--- MULtty Serial Terminal ---\n");
        });

        socket.on('terminal-input', async (data) => {
            if (currentRoom) {
                // Emite para os outros na sala (exceto quem enviou)
                socket.to(currentRoom).emit('terminal-output', data);
                // Salva o estado no Redis
                await client.append(`terminal:${currentRoom}:data`, data);
            }
        });

        socket.on('send-msg', (payload) => {
            if (currentRoom) {
                io.to(currentRoom).emit('new-msg', payload);
            }
        });
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
}

startServer();
