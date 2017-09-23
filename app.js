var express = require('express');
var path = require('path');
var mongoose = require('mongoose');
var passport = require('passport');
var flash    = require('connect-flash');
const port = process.env.PORT || 3000;

var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser   = require('body-parser');
var session      = require('express-session');

var app = express();
var server = require('http').Server(app);
var signalingServer = require('./app_server/utilities/signalingServer')(server);

var configDB = require('./config/database.js');
// configuration ===============================================================
mongoose.connect(configDB.url); // connect to our database

// set up our express application
app.use(logger('dev'));
app.use(cookieParser());
app.use(bodyParser());
app.use(bodyParser.urlencoded({ extended: true }));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(express.static(path.join(__dirname, 'public')));

// required for passport
app.use(session({ secret: 'heliswebrtc' })); // session secret
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session

require('./config/passport')(passport); // pass passport for configuration

var index = require('./app_server/routes/index')(passport);
app.use('/', index);

server.listen(port, function() {
    console.log('Server started on port: ' + port)
});