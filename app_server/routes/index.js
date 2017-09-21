var express = require('express');
var indexCtrl = require('../controllers/index.js');
var router = express.Router();

/* GET home page. */
router.get('/', indexCtrl.index);
router.get('/signaling', indexCtrl.signaling);
router.get('/dashboard', indexCtrl.dashboard);

module.exports = router;