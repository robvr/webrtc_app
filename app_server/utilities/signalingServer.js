module.exports = function(server) {
    var io = require('socket.io')(server);

    let clients = [];
    io.sockets.on('connection', function(socket) {
        // ---- Add socket to clients Array when a new user joins; instruct other peers to update the list ----
        socket.on('joined', function(data) {
            data.socketID = socket.id;
            data.status = 'online';
            clients.push(data);

            //io.emit('update_clients', clients);
            io.emit('update_clients_status', data);
        });

        // ---- send MSG to specific socket ---- //
        socket.on('send_message', function(data) {
            console.log(data.toString());
            let msg = data.message,
                sendTo = data.to,
                from = data.from;
            console.log(msg);

            socket.broadcast.to(findSocketByClientID(sendTo)).emit('message', JSON.stringify({
                msg: msg,
                from: from
            }));
        });

        // ---- Remove clients from Array when disconnected ----
        socket.on('disconnect', function() {
            log('disconnected');
            var index = findSocketIndex(socket.id);
            if(index) {
                clients[index].status = 'offline';
                io.emit('update_clients_status', clients[index]);
                clients.splice(index, 1);
            }
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

    // ---- Log Function ---- //
    var log = function(text) {
        var time = new Date();
        console.log("[" + time.toLocaleTimeString() + "]" + text);
    }
}