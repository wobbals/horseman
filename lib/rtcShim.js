const debug = require('debug')('horseman:rtcShim');

let shims = {};

const on = function(event, handler) {
  shims[event] = handler;
}

const populateGlobals = function() {
  function RTCPeerConnection(configuration, constraints) {
    debug(`RTCPeerConnection: config=${JSON.stringify(configuration)} `+
    `constraints=${JSON.stringify(constraints)}`);

    this.localDescription = null; // a RTCSessionDescription
    this.remoteDescription = null; // a RTCSessionDescription

    shims.newRTCPeerConnection(configuration, constraints);
  };

  RTCPeerConnection.prototype = {
    addEventListener: function(event, handler) {
      debug(`addEventListener: event=${event}`);
      shims.addEventListener(event, handler);
    },

    removeEventListener: function(event, handler) {
      debug(`removeEventListener: event=${event}`);
      shims.removeEventListener(event, handler);
    },

    createOffer: function(success, failure, constraints) {
      debug('createOffer');
      return shims.createOffer(success, failure, constraints);
    },

    createAnswer: function(success, failure, constraints) {
      debug('createAnswer');
      return shims.createAnswer(success, failure, constraints);
    },

    setLocalDescription: function(description, success, failure) {
      debug(`setLocalDescription`);
      this.localDescription = description;
      return shims.setLocalDescription(description, success, failure);
    },

    setRemoteDescription: function(description, success, failure) {
      debug(`setRemoteDescription`);
      this.remoteDescription = description;
      return shims.setRemoteDescription(description, success, failure);
    },

    addIceCandidate: function(candidate,success,failure) {
      debug(`addIceCandidate`);
    },

    getLocalStreams: function() {
      debug(`getLocalStreams`);
      return [];
    },

    getRemoteStreams: function() {
      debug(`getLocalStreams`);
      return [];
    },

    getStreamById: function(id) {
      debug(`getStreamById`);
      return [];
    },

    addStream: function(stream,constraints) {
      debug(`addStream`);
    },

    removeStream: function(stream) {
      debug(`removeStream`);
    },

    close: function () {
      debug(`close`);
    }
  };

  global.window = {};
  global.RTCPeerConnection = RTCPeerConnection;
  global.window.RTCPeerConnection = RTCPeerConnection;

  let RTCSessionDescription = function (o) {
    this.type = (typeof o.type === 'undefined') ? null : o.type;
    this.sdp = (typeof o.sdp === 'undefined') ? null : o.sdp;
  };

  global.RTCSessionDescription = RTCSessionDescription;

  return RTCPeerConnection;
}

module.exports = {
  populateGlobals,
  on
}