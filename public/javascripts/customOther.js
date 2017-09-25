// ---- User parameters ----
let user, peerID = null;
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

/** browser dependent definition are aligned to one and the same standard name **/
navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;

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
            guiComponenets.answerCall.on('click', function() {
                answerCall(message.from, content);
                afterAnswerGUI();
            });
        } else if(content.type === 'answer') {
            console.log('Received answer ...');
            setAnswer(new RTCSessionDescription(content));
        } else if(content.type === 'candidate') {
            // --- got ICE candidate ---
            console.log('Received ICE candidate ...');
            addICECandidate(new RTCIceCandidate(content.ice));
        } else if(content.type === 'close_call') {
            endCall();
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
        endCall();
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

// ---- Cookie Helper ---- //
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
};

// ---- run start(true) to initiate a call ---- //
function initiateCall(calleeUsername) {
    prepareCall();
    // get the local stream, show it in the local video element and send it
    navigator.getUserMedia({ "audio": true, "video": true }, function (stream) {
        localStream = stream;
        guiComponenets.localVideo.src = URL.createObjectURL(localStream);

        // Prepare GUI
        guiComponenets.videoCallContainer.find('#answer_call').hide();
        guiComponenets.videoCallContainer.find('#leave_call').show();
        guiComponenets.videoCallContainer.find('#call_from').html('Call To: ' + calleeUsername);
        guiComponenets.videoCallContainer.show();

        peerConnection.addStream(localStream);
        createAndSendOffer();
    }, function(error) { console.log(error);});
};

// ---- answer incoming call ---- //
function answerCall(caller, offerSessionDescription) {
    prepareCall();
    // get the local stream, show it in the local video element and send it
    navigator.getUserMedia({ "audio": true, "video": true }, function (stream) {
        peerID = caller.userID;
        localStream = stream;
        guiComponenets.localVideo.src = URL.createObjectURL(localStream);
        peerConnection.addStream(localStream);

        peerConnection.setRemoteDescription(new RTCSessionDescription(offerSessionDescription)).then(function() {
            createAndSendAnswer(caller);
        });
    }, function(error) { console.log(error);});
};

// ---- create and send call request to callee ---- //
function createAndSendOffer() {
    peerConnection.createOffer(
        function (offer) {
            var off = new RTCSessionDescription(offer);
            peerConnection.setLocalDescription(new RTCSessionDescription(off),
                function() {
                    console.log('---sending sdp ---');
                    console.log(off);
                    let message = JSON.stringify(off);
                    sendMessage({
                        message: message,
                        from: user,
                        to: peerID
                    });
                },
                function(error) { console.warn(error);}
            );
        },
        function (error) { console.warn(error);}
    );
};

// ---- create and answer reqeust to caller ---- //
function createAndSendAnswer(caller) {
    console.log('---- setting answer ----')
    peerConnection.createAnswer(
        function (answer) {
            var ans = new RTCSessionDescription(answer);
            peerConnection.setLocalDescription(ans, function() {
                    let message = JSON.stringify(ans);
                    sendMessage({
                        message: message,
                        from: user,
                        to: caller.userID
                    });
                },
                function (error) { console.warn(error);}
            );
        },
        function (error) {console.warn(error);}
    );
};

// ---- set answer received from callee ---- //
function setAnswer(answerSessionDescription) {
    peerConnection.setRemoteDescription(answerSessionDescription).then(function() {
        console.log('Set RemoteDescription of Callee');
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

// ---- end call handler ---- //
function endCall() {
    if(peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(function (track) {
            track.stop();
        });
        localStream = null;
        guiComponenets.localVideo.src = "";
    }

    if(remoteStream) {
        remoteStream.getTracks().forEach(function (track) {
            track.stop();
        });
        remoteStream = null;
        guiComponenets.remoteVideo.src = "";
    }
    if(peerID) peerID = null;

    // ---- gui modifications ----
    guiComponenets.videoCallContainer.hide();
};