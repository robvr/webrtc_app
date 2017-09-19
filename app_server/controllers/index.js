var indexCtrl = {
    index: function(req, res) {
        res.render('index', { title: 'Very simple WebRTC application with a Node.js signaling server' });
    },
    signaling: function(req, res) {
        res.render('signaling', { title: 'Very simple WebRTC application with a Node.js signaling server' });
    }
}

module.exports = indexCtrl;