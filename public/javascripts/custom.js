// ---- User parameters ----
let userID, username, isInitiator = false, user;
let guiComponenets = {};
let socket;
let localStream = null,
    remoteStream = null;
let peerConnection = null;
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

$(document).ready(function () {
    guiComponenets = {
        localVideo: document.getElementById('local_video'),
        remoteVideo: document.getElementById('remote_video'),
        localVideoBtn: $('#local_video_btn'),
        videoCallContainer: $('#video-container'),
        leaveCall: $('#leave_call'),
        contactList: $('#contact_list'),
        chatBtn: '.contact-list_contact_button-chat',
        callBtn: '.contact-list_contact_button-audio',
        videoCallBtn: '.contact-list_contact_button-video',
    };

    //username = un;
    //userID = uuidv4();
    user = JSON.parse(decodeURIComponent(readCookie('userDetails')));
    window.user = user;

    // ---- Connect to signaling server ----
    socket = io.connect(window.location.host);

    // ---- Socket Events ----
    socket.emit('joined', {
        'username': user.email,
        'userID': user.userID
    });

    socket.on('update_clients_status', function(data) {
        console.log('Must udpate status of: ' + data.userID);
        updateStatusOfClient(guiComponenets.contactList, data);
    })

    socket.on('message', function(data) {
        console.log(data);
        let message  = JSON.parse(data);
        let content = JSON.parse(message.msg);

        if(content.type === 'offer') {
            // ---- got offer ----
            console.log('Received offer ...');
            acceptCall(message.from);
            guiComponenets.videoCallContainer.on('click', '#answer_call', function() {
                let offer = new RTCSessionDescription(content);
                 startVideo(guiComponenets.localVideo).then(function () {
                     setOffer(offer, message.from);
                 });
            });
        } else if(content.type === 'answer') {
            // ---- got answer ----
            console.log('Received answer ...');
            let answer = new RTCSessionDescription(content);
            setAnswer(answer);
        } else if(content.type === 'candidate') {
            // --- got ICE candidate ---
            console.log('Received ICE candidate ...');
            let candidate = new RTCIceCandidate(content.ice);
            if(peerConnection)
                addIceCandidate(candidate);
        } else if(content.type === 'close_call') {
            hangUp();
        }
    });

    // ---- GUI Event Handlers
    guiComponenets.leaveCall.on('click', function () {
        stopVideo();
        guiComponenets.videoCallContainer.hide();
    });

    guiComponenets.contactList.on('click', guiComponenets.chatBtn, function() {
        console.log('chat with peer');
    });

    guiComponenets.contactList.on('click', guiComponenets.callBtn, function() {
        console.log('call with peer');
    });

    guiComponenets.contactList.on('click', guiComponenets.videoCallBtn, function() {
        callPeer($(this).data('uid'), $(this).data('username'), guiComponenets.localVideo);
    });
});

// ---- Cookie Helper ----
function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}

// ---- GUI helpers ----
function updateStatusOfClient(element, client) {
    // TODO: try to select elements from element
    var item = $('#status_' + client.userID);
    //item.hasClass('online') ? item.removeClass('online').addClass('offline') : item.removeClass('offline').addClass('online');
    item.removeClass('online offline').addClass(client.status);
}

// ---- media handling ----
// ---- start & stop local video ----
function startVideo(element) {
    return new Promise(function(resolve, reject) {
        getDeviceStream({video: true, audio: true})
            .then(function (stream) { // success
                localStream = stream;
                playVideo(element, stream);
                resolve(stream);
            })
            .catch(function (error) { // error
                console.error('getUserMedia error:', error);
                reject(new Error('no stream'));
                return;
            });
    })
}
function stopVideo() {
    pauseVideo(guiComponenets.localVideo);
    pauseVideo(guiComponenets.remoteVideo);
    stopLocalStream();
}
function stopLocalStream() {
    // TODO
    console.log('closing peerConnection');
    peerConnection.close();
    peerConnection = null;
    console.log(peerConnection);

    let tracks = localStream.getTracks();
    if (!tracks) {
        console.warn('NO tracks');
        return;
    }

    for (let track of tracks) {
        track.stop();
    }

    let remoteTracks = remoteStream.getTracks();
    for(let track of remoteTracks)
        track.stop();
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
            //localAudio.srcObject = stream;
        }
        else {
            console.log('stream alreay playnig, so skip');
        }
    }
    else {
        element.src = window.URL.createObjectURL(stream);
    }
    element.play();
    //element.volume = 0;
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

function sendSdp(sessionDescription, uid) {
    console.log('---sending sdp ---');
    //textForSendSdp.value = sessionDescription.sdp;

    let message = JSON.stringify(sessionDescription);
    sendMessage({
        message: message,
        from: user,
        to: uid
    });
}

function sendIceCandidate(candidate, uid) {
    console.log('---sending ICE candidate ---');
    let obj = { type: 'candidate', ice: candidate };
    let message = JSON.stringify(obj);
    console.log('sending candidate=' + message);
    sendMessage({
        message: message,
        from: user.userID,
        to: uid
    })
}

function sendMessage(msg) {
    socket.emit('send_message', msg);
}

// ---- connection handling ----
function prepareNewConnection(uid) {
    let peer = new RTCPeerConnection(pc_config);

    // --- on get remote stream ---
    if ('ontrack' in peer) {
        peer.ontrack = function(event) {
            console.log('-- peer.ontrack()');
            let stream = event.streams[0];
            playVideo(guiComponenets.remoteVideo, stream);
            if (event.streams.length > 1) {
                console.warn('got multi-stream, but play only 1 stream');
            }
        };
    } else {
        peer.onaddstream = function(event) {
            console.log('-- peer.onaddstream()');
            remoteStream = event.stream;
            playVideo(guiComponenets.remoteVideo, remoteStream);

            // ---- Minor GUI ----
            guiComponenets.videoCallContainer.find('#call_from').html('');
        };
    }

    // --- on get local ICE candidate
    peer.onicecandidate = function (evt) {
        if (evt.candidate) {
            console.log(evt.candidate);
            sendIceCandidate(evt.candidate, uid);
        } else {
            console.log('empty ice event');
            sendSdp(peer.localDescription);
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

function makeOffer(uid) {
    peerConnection = prepareNewConnection(uid);

    peerConnection.createOffer()
        .then(function (sessionDescription) {
            console.log('createOffer() succsess in promise');
            return peerConnection.setLocalDescription(sessionDescription);
        })
        .then(function() {
            console.log('setLocalDescription() succsess in promise');
            console.log('must send sdp offer to: ' + uid);
            sendSdp(peerConnection.localDescription, uid);
        }).catch(function(err) {
        console.error(err);
    });
}

function setOffer(sessionDescription, fromUser) {
    if (peerConnection) {
        console.error('peerConnection alreay exist!');
    }
    peerConnection = prepareNewConnection(fromUser.userID);
    peerConnection.setRemoteDescription(sessionDescription)
        .then(function() {
            makeAnswer(fromUser);
        })
        .catch(function(err) {
        });
}

function makeAnswer(fromUser) {
    // ---- Minor GUI ----
    guiComponenets.videoCallContainer.find('#answer_call').hide();
    guiComponenets.videoCallContainer.find('#leave_call').show();

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
            sendSdp(peerConnection.localDescription, fromUser.userID);
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
        }).catch(function(err) {
    });
}

// --- tricke ICE ---
function addIceCandidate(candidate) {
    if (peerConnection) {
        console.log('added ice candidate');
        peerConnection.addIceCandidate(candidate);
    } else {
        console.error('PeerConnection not exist!');
        return;
    }
}

// ---- start PeerConnection ----
function callPeer(uid, username, localVideoElement) {
    if (!peerConnection) {
        startVideo(localVideoElement).then(function() {
            guiComponenets.videoCallContainer.find('#answer_call').hide();
            guiComponenets.videoCallContainer.find('#leave_call').show();
            guiComponenets.videoCallContainer.find('#call_from').html('Call To: ' + username);
            guiComponenets.videoCallContainer.show();
            isInitiator = true;

            makeOffer(uid);
        });

    } else {
        console.warn('peer already exist.');
    }
}

// ---- Accept Call ----
function acceptCall(user) {
    guiComponenets.videoCallContainer.find('#answer_call').show();
    guiComponenets.videoCallContainer.find('#leave_call').hide();
    guiComponenets.videoCallContainer.find('#call_from').html('Call From: ' + user.email);
    guiComponenets.videoCallContainer.show();
}