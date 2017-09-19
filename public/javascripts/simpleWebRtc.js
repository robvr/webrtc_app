let localVideo = document.getElementById('local_video');
let localStream;

// start local video
function startVideo() {
    navigator.mediaDevices.getUserMedia({video: true, audio: false})
        .then(function (stream) { // success
            localStream = stream;
            localVideo.src = window.URL.createObjectURL(localStream);
        }).catch(function (error) { // error
            console.error('mediaDevice.getUserMedia() error:', error);
            return;
        });
}

// stop local video
function stopVideo() {
    for (track of localStream.getTracks()) {
        track.stop();
    }
    localStream = null;

    localVideo.pause();
    window.URL.revokeObjectURL(localVideo.src);
    localVideo.src = '';
}