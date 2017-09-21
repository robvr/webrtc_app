// ---- User parameters ----
let userID, username, isInitiator = false;
let localVideoGlobal = document.getElementById('local_video'),
    remoteVideoGlobal = document.getElementById('remote_video');
let guiComponenets = {};
let socket;
let localStream = null;
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

        // ---- Socket Events ----
        socket.emit('joined', {
            'username': username,
            'userID': userID
        });

        socket.on('update_clients', function(data) {
            updateClientList(guiComponenets.contactList, data);
        });

        socket.on('message', function(data) {
            console.log(data);
            let message  = JSON.parse(data);
            let content = JSON.parse(message.msg);

            if(content.type === 'offer') {
                // ---- got offer ----
                console.log('Received offer ...');
                let offer = new RTCSessionDescription(content);
                startVideo(guiComponenets.localVideo).then(function () {
                    setOffer(offer, message.from);
                });
            } else if(content.type === 'answer') {
                // ---- got answer ----
                console.log('Received answer ...');
                let answer = new RTCSessionDescription(content);
                setAnswer(answer);
            } else if(content.type === 'candidate') {
                // --- got ICE candidate ---
                console.log('Received ICE candidate ...');
                console.log(content);
                let candidate = new RTCIceCandidate(content.ice);
                addIceCandidate(candidate);
            } else if(content.type === 'close_call') {
                hangUp();
            }
        });

        // ---- GUI Event Handlers
        guiComponenets.localVideoBtn.on('click', function() {
            startVideo(guiComponenets.localVideo);
            guiComponenets.videoCallContainer.show();
        })

        guiComponenets.leaveCall.on('click', function () {
            stopVideo(guiComponenets.localVideo);
            guiComponenets.videoCallContainer.hide();
        });

        guiComponenets.contactList.on('click', guiComponenets.chatBtn, function() {
            console.log('chat with peer');
        });

        guiComponenets.contactList.on('click', guiComponenets.callBtn, function() {
            console.log('call with peer');
        });

        guiComponenets.contactList.on('click', guiComponenets.videoCallBtn, function() {
            callPeer($(this).data('uid'), guiComponenets.localVideo);
        });
    });
});

// ---- GUI helpers ----
function updateClientList(element, contacts) {
    let tmpl = '';
    contacts.forEach(function(contact) {
        if(contact.userID != userID)
            tmpl += '<div class="contact-list-contact">' +
                        '<a class="contact-list_contact_link">' +
                            '<span class="contact-list_contact_avatar" style="background-image: url(&quot;/images/male_avatar.svg&quot;)"></span>' +
                            '<span class="contact-list_contact_name">' + contact.username + '</span>' +
                        '</a>' +
                        '<a class="contact-icon contact-list_contact_button-chat" data-uid="' + contact.userID + '"></a>' +
                        '<a class="contact-icon contact-list_contact_button-audio" data-uid="' + contact.userID + '"></a>' +
                        '<a class="contact-icon contact-list_contact_button-video" data-uid="' + contact.userID + '"></a>' +
                    '</div>'
    });
    element.html(tmpl);

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
function stopVideo(element) {
    pauseVideo(element);
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

function sendSdp(sessionDescription, uid) {
    console.log('---sending sdp ---');
    //textForSendSdp.value = sessionDescription.sdp;

    let message = JSON.stringify(sessionDescription);
    sendMessage({
        message: message,
        from: userID,
        to: uid
    });
}

function sendIceCandidate(candidate, uid) {
    console.log('---sending ICE candidate ---');
    let obj = { type: 'candidate', ice: candidate };
    let message = JSON.stringify(obj);
    console.log('sending candidate=' + message);
    sendMessage(message);
    sendMessage({
        message: message,
        from: userID,
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
            playVideo(remoteVideoGlobal, stream);
            if (event.streams.length > 1) {
                console.warn('got multi-stream, but play only 1 stream');
            }
        };
    } else {
        peer.onaddstream = function(event) {
            console.log('-- peer.onaddstream()');
            let stream = event.stream;
            playVideo(remoteVideoGlobal, stream);
        };
    }

    // --- on get local ICE candidate
    peer.onicecandidate = function (evt) {
        if (evt.candidate) {
            console.log(evt.candidate);
            sendIceCandidate(evt.candidate, uid);
        } else {
            console.log('empty ice event');
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

function setOffer(sessionDescription, uid) {
    if (peerConnection) {
        console.error('peerConnection alreay exist!');
    }
    peerConnection = prepareNewConnection(uid);
    peerConnection.setRemoteDescription(sessionDescription)
        .then(function() {
            console.log('setRemoteDescription(offer) succsess in promise');
            makeAnswer(uid);
        })
        .catch(function(err) {
            console.error('setRemoteDescription(offer) ERROR: ', err);
        });
}

function makeAnswer(uid) {
    // ---- Minor GUI ----
    guiComponenets.videoCallContainer.show();

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
            sendSdp(peerConnection.localDescription, uid);
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
        console.log('added ice candidate');
        peerConnection.addIceCandidate(candidate);
    } else {
        console.error('PeerConnection not exist!');
        return;
    }
}

// ---- start PeerConnection ----
function callPeer(uid, localVideoElement, globalVideoElement) {
    if (!peerConnection) {
        startVideo(localVideoElement).then(function() {
            guiComponenets.videoCallContainer.show();
            isInitiator = true;

            makeOffer(uid);
        });

    } else {
        console.warn('peer already exist.');
    }
}

