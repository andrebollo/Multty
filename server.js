const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const redis = require('redis');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Configuração resiliente do Redis
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const client = redis.createClient({
    url: redisUrl,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) return new Error('Redis desistiu após 10 tentativas');
            return Math.min(retries * 100, 3000); // Tenta reconectar a cada 3s
        },
        // Se a URL começar com rediss:// (com dois S), o Render exige TLS
        tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
    }
});

client.on('error', (err) => console.error('Erro no Cliente Redis:', err));
client.on('connect', () => console.log('Redis Conectando...'));
client.on('reconnecting', () => console.log('Redis Reconectando...'));
client.on('ready', () => console.log('Redis Pronto e Conectado!'));

async function startServer() {
    try {
        await client.connect();
        
        app.use(express.static(__dirname));

        io.on('connection', (socket) => {
            let currentRoom = null;

            socket.on('join-room', async ({ room, user }) => {
                currentRoom = room;
                socket.join(room);
                try {
                    const screenState = await client.get(`terminal:${room}:data`);
                    socket.emit('terminal-init', screenState || "--- MULtty Serial Terminal ---\n");
                } catch (e) { console.error("Erro ao ler Redis:", e); }
            });

            socket.on('terminal-input', async (data) => {
                if (currentRoom && client.isOpen) {
                    socket.to(currentRoom).emit('terminal-output', data);
                    await client.append(`terminal:${currentRoom}:data`, data);
                }
            });

            socket.on('send-msg', (payload) => {
                if (currentRoom) io.to(currentRoom).emit('new-msg', payload);
            });
        });

        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
    } catch (err) {
        console.error('Falha crítica ao iniciar Redis:', err);
    }
}

startServer();
