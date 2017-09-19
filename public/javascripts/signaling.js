let localVideo = document.getElementById('local_video');
let remoteVideo = document.getElementById('remote_video');
let connectBtn = document.getElementById('connect');
let hangUpBtn = document.getElementById('hangUp');
let localStream = null;
let peerConnection = null;
let textForSendSdp = document.getElementById('text_for_send_sdp');
let textToReceiveSdp = document.getElementById('text_for_receive_sdp');
let clientList = document.getElementById('client_list');

// ---- User parameters ----
let userID, username, toID;
let socket;
let pc_config = {"iceServers":[
    {
        'url': 'stun:stun.l.google.com:19302'
    }
]};

// ---- prefix ----
navigator.getUserMedia  = navigator.getUserMedia    || navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia || navigator.msGetUserMedia;
RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
RTCSessionDescription = window.RTCSessionDescription || window.webkitRTCSessionDescription || window.mozRTCSessionDescription;

// ---- Ask for username ----
swal({
    title: 'Enter your nickname:',
    input: 'text',
    inputPlaceholder: 'Nickname',
    allowOutsideClick: false,
    showCancelButton: false,
    inputValidator: function (value) {
        return new Promise(function (resolve, reject) {
            if (value) {
                resolve()
            } else {
                reject('You must enter the room name!')
            }
        })
    }
}).then(function(un) {
    username = un;
    userID = uuidv4();
    window.userID = userID;

    // ---- Connect to signaling server ----
    socket = io.connect(window.location.host);

    socket.emit('joined', {
        'username': username,
        'userID': userID
    });

    socket.on('update_clients', function(data) {
        updateClientList(data);
    });

    socket.on('message', function(data) {
        let message  = JSON.parse(data);
        let content = JSON.parse(message.msg);

        if(content.type === 'offer') {
            toID = message.from;
            // ---- got offer ----
            console.log('Received offer ...');
            textToReceiveSdp.value = content.sdp;
            let offer = new RTCSessionDescription(content);
            setOffer(offer);
        } else if(content.type === 'answer') {
            // ---- got answer ----
            console.log('Received answer ...');
            textToReceiveSdp.value = content.sdp;
            let answer = new RTCSessionDescription(content);
            setAnswer(answer);
        } else if(content.type === 'candidate') {
            // --- got ICE candidate ---
            console.log('Received ICE candidate ...');
        }
    });
});

// ---- GUI helpers ----
function updateClientList(clients) {
    let tmpl = '';
    clients.forEach(function(client) {
        if(client.userID != userID)
            tmpl += '<li><button onclick="setCalleeID(\'' + client.userID + '\')">Call: ' + client.username + '</button></li>'
    });
    clientList.innerHTML = tmpl;
}

function setCalleeID(cid) {
    connectBtn.disabled = false;
    toID = cid;
}

// ---- media handling ----
// start & stop local video
function startVideo() {
    getDeviceStream({video: true, audio: true})
        .then(function (stream) { // success
            localStream = stream;
            playVideo(localVideo, stream);
        }).
        catch(function (error) { // error
            console.error('getUserMedia error:', error);
            return;
        });
}

function stopVideo() {
    pauseVideo(localVideo);
    stopLocalStream(localStream);
}

function stopLocalStream(stream) {
    let tracks = stream.getTracks();
    if (!tracks) {
        console.warn('NO tracks');
        return;
    }

    for (let track of tracks) {
        track.stop();
    }
}

function getDeviceStream(option) {
    if ('getUserMedia' in navigator.mediaDevices) {
        console.log('navigator.mediaDevices.getUserMedia');
        return navigator.mediaDevices.getUserMedia(option);
    } else {
        console.log('wrap navigator.getUserMedia with Promise');
        return new Promise(function(resolve, reject){
            navigator.getUserMedia(option,
                resolve,
                reject
            );
        });
    }
}

function playVideo(element, stream) {
    if ('srcObject' in element) {
        if (!element.srcObject) {
            element.srcObject = stream;
        }
        else {
            console.log('stream alreay playnig, so skip');
        }
    }
    else {
        element.src = window.URL.createObjectURL(stream);
    }
    element.play();
    element.volume = 0;
}

function pauseVideo(element) {
    element.pause();
    if ('srcObject' in element) {
        element.srcObject = null;
    }
    else {
        if (element.src && (element.src !== '') ) {
            window.URL.revokeObjectURL(element.src);
        }
        element.src = '';
    }
}

// ----- Hand signaling ---- //
function onSdpText() {
    let text = textToReceiveSdp.value;
    if (peerConnection) {
        console.log('Received answer text...');
        let answer = new RTCSessionDescription({
            type : 'answer',
            sdp : text,
        });
        setAnswer(answer);
    }
    else {
        console.log('Received offer text...');
        let offer = new RTCSessionDescription({
            type : 'offer',
            sdp : text,
        });
        setOffer(offer);
    }
    textToReceiveSdp.value ='';
}

function sendSdp(sessionDescription, toID) {
    console.log('---sending sdp ---');
    textForSendSdp.value = sessionDescription.sdp;

    let message = JSON.stringify(sessionDescription);
    console.log('sending SDP=' + message);
    sendMessage({
        message: message,
        from: userID,
        to: toID
    });
}

function sendIceCandidate(candidate, toID) {
    console.log('---sending ICE candidate ---');
    let obj = { type: 'candidate', ice: candidate };
    let message = JSON.stringify(obj);
    console.log('sending candidate=' + message);
    sendMessage(message);
    sendMessage({
        message: message,
        from: userID,
        to: toID
    })
}

function sendMessage(msg) {
    console.log(msg);
    socket.emit('send_message', msg);
}

// ---------------------- connection handling -----------------------
function prepareNewConnection() {
    let peer = new RTCPeerConnection(pc_config);

    // --- on get remote stream ---
    if ('ontrack' in peer) {
        peer.ontrack = function(event) {
            console.log('-- peer.ontrack()');
            let stream = event.streams[0];
            playVideo(remoteVideo, stream);
            if (event.streams.length > 1) {
                console.warn('got multi-stream, but play only 1 stream');
            }
        };
    } else {
        peer.onaddstream = function(event) {
            console.log('-- peer.onaddstream()');
            let stream = event.stream;
            playVideo(remoteVideo, stream);
        };
    }

    // --- on get local ICE candidate
    peer.onicecandidate = function (evt) {
        if (evt.candidate) {
            console.log(evt.candidate);

            // Trickle ICE の場合は、ICE candidateを相手に送る
            sendIceCandidate(evt.candidate, toID);

            //// Vanilla ICE の場合には、何もしない
        } else {
            console.log('empty ice event');

            // Trickle ICE の場合は、何もしない
            // Vanilla ICE の場合には、ICE candidateを含んだSDPを相手に送る
            //sendSdp(peer.localDescription);
        }
    };


    // -- add local stream --
    if (localStream) {
        console.log('Adding local stream...');
        if ('addTrack' in peer) {
            console.log('use addTrack()');
            let tracks = localStream.getTracks();
            for (let track of tracks) {
                let sender = peer.addTrack(track, localStream);
            }
        }
        else {
            console.log('use addStream()');
            peer.addStream(localStream);
        }
    } else {
        console.warn('no local stream, but continue.');
    }

    return peer;
}

function makeOffer() {
    peerConnection = prepareNewConnection();

    peerConnection.createOffer()
        .then(function (sessionDescription) {
            console.log('createOffer() succsess in promise');
            return peerConnection.setLocalDescription(sessionDescription);
        })
        .then(function() {
            console.log('setLocalDescription() succsess in promise');
            sendSdp(peerConnection.localDescription, toID);
        }).catch(function(err) {
            console.error(err);
        });
}

function setOffer(sessionDescription) {
    if (peerConnection) {
        console.error('peerConnection alreay exist!');
    }
    peerConnection = prepareNewConnection();
    peerConnection.setRemoteDescription(sessionDescription)
        .then(function() {
            console.log('setRemoteDescription(offer) succsess in promise');
            makeAnswer();
        })
        .catch(function(err) {
            console.error('setRemoteDescription(offer) ERROR: ', err);
        });
}

function makeAnswer() {
    console.log('sending Answer. Creating remote session description...' );
    if (!peerConnection) {
        console.error('peerConnection NOT exist!');
        return;
    }

    peerConnection.createAnswer()
        .then(function (sessionDescription) {
            console.log('createAnswer() succsess in promise');
            return peerConnection.setLocalDescription(sessionDescription);
        })
        .then(function() {
            console.log('setLocalDescription() succsess in promise');

            // -- Trickle ICE の場合は、初期SDPを相手に送る --
            sendSdp(peerConnection.localDescription, toID);

            // -- Vanilla ICE の場合には、まだSDPは送らない --
            //sendSdp(peerConnection.localDescription);
        })
        .catch(function(err) {
            console.error(err);
        });
}

function setAnswer(sessionDescription) {
    if (! peerConnection) {
        console.error('peerConnection NOT exist!');
        return;
    }

    peerConnection.setRemoteDescription(sessionDescription)
        .then(function() {
            console.log('setRemoteDescription(answer) succsess in promise');
        }).catch(function(err) {
        console.error('setRemoteDescription(answer) ERROR: ', err);
    });
}

// --- tricke ICE ---
function addIceCandidate(candidate) {
    if (peerConnection) {
        peerConnection.addIceCandidate(candidate);
    }
    else {
        console.error('PeerConnection not exist!');
        return;
    }
}

// start PeerConnection
function connect() {
    if (!peerConnection) {
        console.log('make Offer');
        makeOffer();
    } else {
        console.warn('peer already exist.');
    }
}

// close PeerConnection
function hangUp() {
    if (peerConnection) {
        console.log('Hang up.');
        peerConnection.close();
        peerConnection = null;
        pauseVideo(remoteVideo);
    }
    else {
        console.warn('peer NOT exist.');
    }
}