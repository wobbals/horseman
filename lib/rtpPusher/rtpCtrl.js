const fs = require('fs');
const child_process = require('child_process');
const zmq = require('zeromq');
const pushSock = zmq.socket('push');
const recv = zmq.socket('pull');
const debug = require('debug')('horseman:rtpPusher:rtpCtrl');

let callbacks = {};

recv.on('message', (type, data, data2) => {
  debug(`recv: ${type}: data=${data}, data2=${data2}`);
  let f = callbacks[type] || function(){};
  f(data, data2);
});

let start = function() {
  debug(`online and listening`);
  recv.bindSync('ipc:///tmp/webrtc_control-left');
  pushSock.connect('ipc:///tmp/webrtc_control-right');
  return Promise.resolve({});
};

let addRemoteCandidate = function(mLineIndex, candidate) {
  debug(`addRemoteCandidate: mLineIndex=${mLineIndex}, candidate=${candidate}`);
  pushSock.send(['add_ice_candidate', `${mLineIndex}`, candidate]);
}

let setRemoteDescription = function(sdp) {
  debug(`setRemoteDescription: sdp=${sdp}`);
  pushSock.send(['set_remote_description', sdp]);
}

let createOffer = function() {
  debug(`createOffer`);
  pushSock.send('create_offer');
}

let on = function(event, handler) {
  callbacks[event] = handler;
}


module.exports = {
  start,
  on,
  createOffer,
  setRemoteDescription,
  addRemoteCandidate
}
