var User = require('../models/user');

var indexCtrl = {
    index: function(req, res) {
        User.find({}, function(err, users) {
            res.render('index', {
                user : req.user,
                users: users
            });
        })
    },
    login: function(req, res) {
        res.render('login.pug', { message: req.flash('loginMessage') });
    },
    loginPost: function (passport) {
        return passport.authenticate('local-login', {
            successRedirect : '/',
            failureRedirect : '/login',
            failureFlash : true
        })
    },
    signup: function(req, res) {
        res.render('signup.pug', { message: req.flash('loginMessage') });
    },
    signupPost: function(passport) {
        return passport.authenticate('local-signup', {
            successRedirect : '/', // redirect to app main page
            failureRedirect : '/signup', // redirect back to the signup page if there is an error
            failureFlash : true // allow flash messages
        })
    },
    logout: function(req, res) {
        var user = req["user"];
        User.find({ "_id": user["_id"] }, function(err, u) {
            u[0].status = 'offline';
            u[0].save(function(err) {
                if(err)
                    return;
                req.logout();
                res.redirect('/login');
            });
        });
    },
    signaling: function(req, res) {
        res.render('signaling', { title: 'Very simple WebRTC application with a Node.js signaling server' });
    }
}

module.exports = indexCtrl;