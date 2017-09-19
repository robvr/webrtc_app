var express = require('express');
var path = require('path');
var logger = require('morgan');

var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
const port = process.env.PORT || 3000;

var index = require('./app_server/routes/index');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);


server.listen(port, function() {
    console.log('Server started on port: ' + port)
});

let clients = [];
io.sockets.on('connection', function(socket) {
    socket.on('joined', function(data) {
        data.socketID = socket.id;
        clients.push(data);

        io.emit('update_clients', clients);
    });

    socket.on('send_message', function(data) {
        let msg = data.message,
            sendTo = data.to,
            from = data.from;

        socket.broadcast.to(findSocketByClientID(sendTo)).emit('message', JSON.stringify({
            msg: msg,
            from: from
        }));
    });
});

function findSocketByClientID(clientID) {
    let socketID;
    clients.forEach(function(client) {
        if(client.userID == clientID) {
            socketID = client.socketID;
        }
    });
    return socketID;
}