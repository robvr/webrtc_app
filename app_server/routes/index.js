var express = require('express');
var indexCtrl = require('../controllers/index.js');
var router = express.Router();

var mainRouter = function(passport) {
    router.get('/', isLoggedIn, indexCtrl.index);
    router.get('/login', indexCtrl.login);
    router.post('/login', function(req, res, next) {
        passport.authenticate('local-login', function(err, user, info) {
            if(!user)
                res.redirect('/login');
            req.logIn(user, function(err) {
               if(err) return next(err);
               console.log(user.local.email);
               res.cookie('userDetails', JSON.stringify({
                   userID: user["_id"],
                   "email": user.local.email
               }));
               return res.redirect('/');
            });
        })(req, res, next);
    });
    router.get('/signup', indexCtrl.signup);
    router.post('/signup', indexCtrl.signupPost(passport));
    router.get('/logout', indexCtrl.logout);
    router.get('/vue', indexCtrl.vueTest);

    return router;
}

// route middleware to make sure a user is logged in
function isLoggedIn(req, res, next) {
    // if user is authenticated in the session, carry on
    if (req.isAuthenticated())
        return next();

    // if they aren't redirect them to the login page
    res.redirect('/login');
}


module.exports = mainRouter;