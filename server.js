// ... (mesma configuração de conexão Redis do código anterior)

io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('join-room', async ({ room, user }) => {
        currentRoom = room;
        socket.join(room);
        
        // Recupera o estado atual do terminal na sala
        const screenState = await client.get(`terminal:${room}:data`);
        socket.emit('terminal-init', screenState || "--- Terminal MULtty Conectado ---\n");
    });

    // Recebe dados do terminal vindos de um usuário e replica para todos
    socket.on('terminal-input', async (data) => {
        if (currentRoom) {
            // data pode ser uma string ou buffer
            socket.to(currentRoom).emit('terminal-output', data);
            
            // Opcional: Persistir o histórico no Redis (limitado para performance)
            await client.append(`terminal:${currentRoom}:data`, data);
            // Lógica para limitar o tamanho da string no Redis pode ser adicionada aqui
        }
    });

    socket.on('send-msg', (payload) => {
        io.to(currentRoom).emit('new-msg', payload);
    });
});
/* ==========================
   SERVER
========================== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});

