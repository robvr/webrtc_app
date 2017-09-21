module.exports = function(server) {
    var io = require('socket.io')(server);

    let clients = [];
    io.sockets.on('connection', function(socket) {
        // ---- Add socket to clients Array when a new user joins; instruct other peers to update the list ----
        socket.on('joined', function(data) {
            data.socketID = socket.id;
            clients.push(data);

            io.emit('update_clients', clients);
        });

        // ---- send MSG to specific socket ----
        socket.on('send_message', function(data) {
            let msg = data.message,
                sendTo = data.to,
                from = data.from;

            socket.broadcast.to(findSocketByClientID(sendTo)).emit('message', JSON.stringify({
                msg: msg,
                from: from
            }));
        });

        // ---- Remove clients from Array when disconnected ----
        socket.on('disconnect', function() {
            clients.splice(findSocketIndex(socket.id), 1);
            io.emit('update_clients', clients);
        })
    });

    // ---- Return index of specific socket ----
    var findSocketIndex = function(sid) {
        for(var i = 0; i < clients.length; i++) {
            if(clients[i].socketID === sid) {
                return i;
            }
        }
    }

    // ---- Find socket id from client id ----
    var findSocketByClientID = function(clientID) {
        let socketID;
        clients.forEach(function(client) {
            if(client.userID == clientID) {
                socketID = client.socketID;
            }
        });
        return socketID;
    }
}