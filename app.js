var express = require('express');
var path = require('path');
var logger = require('morgan');

var app = express();
var server = require('http').Server(app);
var signalingServer = require('./app_server/utilities/signalingServer')(server);
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