// ---- User parameters ----
let user, peerID = null;
let guiComponenets = {};
let socket, hasAddTrack = false;

let localStream = null,
    remoteStream = null;

let peerConnection = null;
let pc_config = {"iceServers":[
    {
        'url': 'stun:stun.l.google.com:19302'
    }/*,
    {
        'url': 'turn:192.158.29.39:3478?transport=udp',
        'credential': 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
        'username': '28224511:1379330808'
    }*/
]},
    mediaConstraints = { "audio": true, "video": true };

/** browser dependent definition are aligned to one and the same standard name **/
navigator.getUserMedia  = navigator.getUserMedia    || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
RTCSessionDescription = window.RTCSessionDescription || window.webkitRTCSessionDescription || window.mozRTCSessionDescription;

$(document).ready(function () {
    guiComponenets = {
        localVideo: document.getElementById('local_video'),
        remoteVideo: document.getElementById('remote_video'),
        localVideoBtn: $('#local_video_btn'),
        videoCallContainer: $('#video-container'),
        leaveCall: $('#leave_call'),
        answerCall: $('#answer_call'),
        contactList: $('#contact_list'),
        chatBtn: '.contact-list_contact_button-chat',
        callBtn: '.contact-list_contact_button-audio',
        videoCallBtn: '.contact-list_contact_button-video',
    };

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
        let message  = JSON.parse(data);
        let content = JSON.parse(message.msg);
        console.log('Received message:');
        console.log(content);

        if(content.type === 'offer') {
            console.log('Received offer ...');
            prepareAnswerGUI(message.from);
            guiComponenets.answerCall.off().on('click', function() {
                answerCall(message.from, content);
                afterAnswerGUI();
            });
        } else if(content.type === 'answer') {
            console.log('Received answer ...');
            setAnswer(new RTCSessionDescription(content));
        } else if(content.type === 'candidate') {
            // --- got ICE candidate ---
            console.log('Received ICE candidate ...');
            addICECandidate(content.ice);
        } else if(content.type === 'close_call') {
            closeVideoCall();
        }
    });

    // ---- GUI Event Handlers
    guiComponenets.leaveCall.on('click', function () {
        sendMessage({
            message: JSON.stringify({
                type: 'close_call'
            }),
            from: user,
            to: peerID
        });
        closeVideoCall();
    });

    guiComponenets.contactList.on('click', guiComponenets.chatBtn, function() {
        console.log('chat with peer');
    });

    guiComponenets.contactList.on('click', guiComponenets.callBtn, function() {
        console.log('call with peer');
    });

    guiComponenets.contactList.on('click', guiComponenets.videoCallBtn, function() {
        peerID = $(this).data('uid');
        initiateCall($(this).data('username'), guiComponenets.localVideo);
    });
});

// ---- General Helpers ---- //
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

function log(text) {
    var time = new Date();
    console.log("[" + time.toLocaleTimeString() + "] " + text);
}

function log_error(text) {
    var time = new Date();
    console.error("[" + time.toLocaleTimeString() + "] " + text);
}

function reportError(errMessage) {
    log_error("Error " + errMessage.name + ": " + errMessage.message);
}

// ---- GUI helpers ---- //
function updateStatusOfClient(element, client) {
    // TODO: try to select elements from element
    var item = $('#status_' + client.userID);
    //item.hasClass('online') ? item.removeClass('online').addClass('offline') : item.removeClass('offline').addClass('online');
    item.removeClass('online offline').addClass(client.status);
}

function prepareAnswerGUI (caller){
    // Prepare GUI
    guiComponenets.videoCallContainer.find('#answer_call').show();
    guiComponenets.videoCallContainer.find('#leave_call').hide();
    guiComponenets.videoCallContainer.find('#call_from').html('Call From: ' + caller.email);
    guiComponenets.videoCallContainer.show();
}

function afterAnswerGUI() {
    guiComponenets.videoCallContainer.find('#answer_call').hide();
    guiComponenets.videoCallContainer.find('#leave_call').show();
}

// ---- Call Helpers ---- //
function prepareCall() {
    peerConnection = new RTCPeerConnection(pc_config);
    // once remote stream arrives, show it in the remote video element
    peerConnection.onaddstream = onAddStreamHandler;
    // send any ice candidates to the other peer
    peerConnection.onicecandidate = onIceCandidateHandler;
}

function createPeerConnection() {
    log("Setting up a connection...");
    peerConnection = new RTCPeerConnection(pc_config);
    hasAddTrack = (peerConnection.addTrack !== undefined);

    // Set up event handlers for the ICE negotiation process.
    peerConnection.onicecandidate = handleICECandidateEvent;
    peerConnection.onnremovestream = handleRemoveStreamEvent;
    peerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
    peerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
    peerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
    peerConnection.onnegotiationneeded = handleNegotiationNeededEvent;

    // Because the deprecation of addStream() and the addstream event is recent,
    // we need to use those if addTrack() and track aren't available.

    if (hasAddTrack) {
        peerConnection.ontrack = handleTrackEvent;
    } else {
        peerConnection.onaddstream = handleAddStreamEvent;
    }
}

// ---- run start(true) to initiate a call ---- //
function initiateCall(calleeUsername) {
    log("Starting to prepare an invitation");
    if(peerConnection) {
        alert('You can\'t start a call because you already have one open!');
    } else {
        log('Setting up connection');
        createPeerConnection();

        log("Requesting webcam access...");
        navigator.mediaDevices.getUserMedia(mediaConstraints)
        .then(function(stream) {
            localStream = stream;
            log("-- Local video stream obtained");
            // ---- Prepare GUI ---- //
            guiComponenets.localVideo.src = URL.createObjectURL(localStream);

            guiComponenets.videoCallContainer.find('#answer_call').hide();
            guiComponenets.videoCallContainer.find('#leave_call').show();
            guiComponenets.videoCallContainer.find('#call_from').html('Call To: ' + calleeUsername);
            guiComponenets.videoCallContainer.show();

            if(hasAddTrack) {
                log("-- Adding tracks to the RTCPeerConnection");
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
            } else {
                log("-- Adding stream to the RTCPeerConnection");
                peerConnection.addStream(localStream);
            }
        })
        .catch(handleGetUserMediaError);
    }
    // get the local stream, show it in the local video element and send it
    /*navigator.getUserMedia({ "audio": true, "video": true }, function (stream) {
        localStream = stream;
        guiComponenets.localVideo.src = URL.createObjectURL(localStream);

        // Prepare GUI
        guiComponenets.videoCallContainer.find('#answer_call').hide();
        guiComponenets.videoCallContainer.find('#leave_call').show();
        guiComponenets.videoCallContainer.find('#call_from').html('Call To: ' + calleeUsername);
        guiComponenets.videoCallContainer.show();

        prepareCall();

        peerConnection.addStream(localStream);
        createAndSendOffer();
    }, function(error) { console.log(error);});*/
};

// ---- answer incoming call ---- //
function answerCall(caller, offerSessionDescription) {
    // Call createPeerConnection() to create the RTCPeerConnection.
    log("Starting to accept invitation from " + caller.email);
    createPeerConnection();

    var desc = new RTCSessionDescription(offerSessionDescription);
    
    peerConnection.setRemoteDescription(desc)
    .then(function () {
        log("Setting up the local media stream...");
        return navigator.mediaDevices.getUserMedia(mediaConstraints);
    })
    .then(function (stream) {
        log("-- Local video stream obtained");
        localStream = stream;

        guiComponenets.localVideo.src = URL.createObjectURL(localStream);

        if (hasAddTrack) {
            log("-- Adding tracks to the RTCPeerConnection");
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream)
            );
        } else {
            log("-- Adding stream to the RTCPeerConnection");
            peerConnection.addStream(localStream);
        }
    })
    .then(function () {
        log("------> Creating answer");
        return peerConnection.createAnswer();
    })
    .then(function(answer) {
        log("------> Setting local description after creating answer");
        return peerConnection.setLocalDescription(answer);
    })
    .then(function () {
        let message = JSON.stringify(peerConnection.localDescription);
        sendMessage({
            message: message,
            from: user,
            to: caller.userID
        });
    })
    .catch(handleGetUserMediaError);

    /*prepareCall();
    navigator.getUserMedia({ "audio": true, "video": true }, function (stream) {
        peerID = caller.userID;
        localStream = stream;
        guiComponenets.localVideo.src = URL.createObjectURL(localStream);

        peerConnection.addStream(localStream);

        peerConnection.setRemoteDescription(offerSessionDescription)
            .then(function() {
                createAndSendAnswer(caller);
            });
    }, function(error) { console.log(error);});*/
};

// ---- create and send call request to callee ---- //
function createAndSendOffer() {
    peerConnection.createOffer()
        .then(function(offer) {
            return peerConnection.setLocalDescription(offer)
        })
        .then(function() {
            console.log('---sending sdp ---');
            console.log(peerConnection.localDescription);
            let message = JSON.stringify(peerConnection.localDescription);
            sendMessage({
                message: message,
                from: user,
                to: peerID
            });
        })
        .catch(function(err) {
            console.error(err);
        });
};

// ---- create and answer reqeust to caller ---- //
function createAndSendAnswer(caller) {
    console.log('---- setting answer ----')
    peerConnection.createAnswer()
        .then(function(answer) {
            return peerConnection.setLocalDescription(answer);
        })
        .then(function() {
            let message = JSON.stringify(peerConnection.localDescription);
            sendMessage({
                message: message,
                from: user,
                to: caller.userID
            });
        })
        .catch(function(err) {
            console.log(err);
        });
};

// ---- set answer received from callee ---- //
function setAnswer(answerSessionDescription) {
    peerConnection.setRemoteDescription(answerSessionDescription)
        .then(function() {
            console.log('Set RemoteDescription of Callee');
        })
        .catch(function(err) {
            console.error(err);
        });
}

// ---- send ICE candidate to the other peer ---- //
function onIceCandidateHandler(evt) {
    if (!evt || !evt.candidate) return;
    console.log('---sending ICE candidate ---');
    console.log(evt.candidate);

    let obj = { type: 'candidate', ice: evt.candidate };
    let message = JSON.stringify(obj);

    sendMessage({
        message: message,
        from: user.userID,
        to: peerID
    });
};

// ---- remote stream handler ---- //
function onAddStreamHandler(evt) {
    console.log('---- add remote stream ----');
    remoteStream = evt.stream;
    guiComponenets.remoteVideo.src = URL.createObjectURL(evt.stream);
};

// ---- send message to the other peer ---- //
function sendMessage(msg) {
    socket.emit('send_message', msg);
}

// ---- add ICE candidate to peer ---- //
function addICECandidate(candidate) {
    console.log(candidate);
    if(peerConnection && peerConnection.remoteDescription.type)
        peerConnection.addIceCandidate(candidate).then().catch(function (err) {
            console.log(err);
        });
}

// ---- close video call handler ---- //
function closeVideoCall() {
    log("Closing the call");

    // Close the RTCPeerConnection
    if (peerConnection) {
        log("--> Closing the peer connection");

        // Disconnect all our event listeners; we don't want stray events
        // to interfere with the hangup while it's ongoing.
        peerConnection.onaddstream = null;  // For older implementations
        peerConnection.ontrack = null;      // For newer ones
        peerConnection.onremovestream = null;
        peerConnection.onnicecandidate = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onsignalingstatechange = null;
        peerConnection.onicegatheringstatechange = null;
        peerConnection.onnotificationneeded = null;

        // Stop the videos
        /*if (guiComponenets.remoteVideo.srcObject) {
            guiComponenets.remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        }

        if (guiComponenets.localVideo.srcObject) {
            guiComponenets.localVideo.srcObject.getTracks().forEach(track => track.stop());
        }

        console.log('removing srcs');
        guiComponenets.remoteVideo.src = null;
        guiComponenets.localVideo.src = null;

        // Close the peer connection
        peerConnection.close();
        peerConnection = null;

        // Free streams
        localStream = null;
        remoteStream = null;*/

        console.log('removing srcs');
        guiComponenets.remoteVideo.src = '';
        guiComponenets.localVideo.src = '';

        if (guiComponenets.remoteVideo.srcObject) {
            guiComponenets.remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        }

        if (guiComponenets.localVideo.srcObject) {
            guiComponenets.localVideo.srcObject.getTracks().forEach(track => track.stop());
        }

        // Close the peer connection
        peerConnection.close();
        peerConnection = null;

        // Free streams
        localStream = null;
        remoteStream = null;
    }

    if(peerID) peerID = null;

    // ---- gui modifications ----
    guiComponenets.videoCallContainer.hide();
}

// ---- Singaling Handlers ---- //
function handleICECandidateEvent(event) {
    if (event.candidate) {
        log("Outgoing ICE candidate: " + event.candidate);

        let obj = { type: 'candidate', ice: event.candidate };
        let message = JSON.stringify(obj);

        sendMessage({
            message: message,
            from: user.userID,
            to: peerID
        });
    }
}

function handleRemoveStreamEvent() {
    log('**** Stream Removed');
    closeVideoCall();
}

function handleICEConnectionStateChangeEvent(evt) {
    log("*** ICE connection state changed to " + peerConnection.iceConnectionState);

    switch(peerConnection.iceConnectionState) {
        case "closed":
        case "failed":
        case "disconnected":
            closeVideoCall();
            break;
    }
}

function handleICEGatheringStateChangeEvent(evt) {
    log("*** ICE gathering state changed to: " + peerConnection.iceGatheringState);
}

function handleSignalingStateChangeEvent(evt) {
    log("*** WebRTC signaling state changed to: " + peerConnection.signalingState);
    switch(peerConnection.signalingState) {
        case "closed":
            closeVideoCall();
            break;
    }
}

function handleNegotiationNeededEvent() {
    log("*** Negotiation needed");

    log("---> Creating offer");
    peerConnection.createOffer().then(function(offer) {
        log("---> Creating new description object to send to remote peer");
        return peerConnection.setLocalDescription(offer);
    })
    .then(function() {
        log("---> Sending offer to remote peer");
        let message = JSON.stringify(peerConnection.localDescription);
        sendMessage({
            message: message,
            from: user,
            to: peerID
        });
    })
    .catch(reportError);
}

function handleTrackEvent(event) {
    log("*** Track event");
    guiComponenets.remoteVideo.src = URL.createObjectURL(event.streams[0]);
}

function handleAddStreamEvent(event) {
    log("*** Stream added");
    console.log(event);
    remoteStream = event.stream;
    guiComponenets.remoteVideo.src = URL.createObjectURL(event.stream);
}

function handleGetUserMediaError(e) {
    log(e);
    switch(e.name) {
        case "NotFoundError":
            alert("Unable to open your call because no camera and/or microphone were found.");
            break;
        case "SecurityError":
        case "PermissionDeniedError":
            // Do nothing; this is the same as the user canceling the call.
            break;
        default:
            console.log("Error opening your camera and/or microphone: " + e.message);
            break;
    }

    // Make sure we shut down our end of the RTCPeerConnection so we're ready to try again.
    closeVideoCall();
}