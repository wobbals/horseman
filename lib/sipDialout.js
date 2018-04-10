const os = require('os');
const EventEmitter = require('events');
const debug = require('debug')('horseman:sip');
const NodeWebSocket = require('jssip-node-websocket');
const JsSIP = require('jssip');
const rtcShim = require('./rtcShim');
rtcShim.populateGlobals();
const transform = require('sdp-transform');
const stun = require('./stunClient');
const reversePublisher = require('./rtpPusher/reversePublisher');

let eventHandlers = new EventEmitter();

const videoRecvRTPPort = 5000;
const videoRecvRTCPPort = 5001;
const audioRecvRTPPort = 5002;
const audioRecvRTCPPort = 5003;

let socket = new NodeWebSocket(process.env.SIP_WS);
let sipOpts = {
  uri: process.env.SIP_USER,
  password: process.env.SIP_PASSWORD,
  sockets: [ socket ],
  register: false
};
let client = new JsSIP.UA(sipOpts);

let start = function() {
  debug('start');
  client.start();
}

rtcShim.on('newRTCPeerConnection', async (configuration, constraints) => {
  debug('new RTCPeerConnection');
});

rtcShim.on('createOffer', async function(success, failure, constraints) {
  let portMapping = await stun.getPortMapping(5001);
  console.log(portMapping);
  return Promise.resolve({
    type: 'offer',
    sdp:
    'v=0\r\n'+
    `o=- 13374 13374 IN IP4 ${portMapping.external.address}\r\n`+
    's=-\r\n'+
    `c=IN IP4 ${portMapping.external.address}\r\n`+
    't=0 0\r\n'+
    //'a=group:LS video audio\r\n'+
    `m=video ${videoRecvRTPPort} RTP/AVPF 107\r\n`+
    `a=rtcp:${portMapping.external.port}\r\n`+
    // 'a=rtpmap:107 VP8/90000\r\n'+
    'a=rtpmap:107 H264/90000\r\n'+
    'a=rtcp-fb:107 ccm fir\r\n'+
    'a=rtcp-fb:107 ccm tmmbr\r\n'+
    'a=rtcp-fb:107 nack\r\n'+
    'a=rtcp-fb:107 nack pl\r\n'+
    // 'a=fmtp:107 packetization-mode=0\r\n'+
    // 'a=fmtp:107 profile-level-id=42801d\r\n'+
    'a=mid:video\r\n'+
    'a=sendrecv\r\n'+
    `m=audio ${audioRecvRTPPort} RTP/AVPF 111\r\n`+
    'a=rtpmap:111 opus/48000/2\r\n'+
    'a=mid:audio\r\n'+
    'a=sendrecv\r\n'
  });
});

rtcShim.on('createAnswer', (success, failure, constraints) => {
  return Promise.reject('unimplemented');
});

rtcShim.on('setLocalDescription', (desc, success, failure) => {
  debug(desc);
  return Promise.resolve({});
});

rtcShim.on('setRemoteDescription', (desc, success, failure) => {
  handleAnswer(desc.sdp);
  return Promise.resolve({});
});

rtcShim.on('addEventListener', (event, handler) => {
  debug(`addEventListener: event=${event}`);
  if ('icecandidate' === event) {
    // this is a hack for jssip. we don't ICE around here.
    setTimeout(() => {
      handler({});
    }, 0);
  }
});

rtcShim.on('removeEventListener', (event, handler) => {
  debug(`removeEventListener: event=${event}`);
});

client.on('connecting', function (args) {
  debug('connecting');
});
client.on('connected', function () {
  debug('connected');

  if (!sipOpts.register) {
    // otherwise we'll emit after registration.
    eventHandlers.emit('started');
  }
});
client.on('disconnected', function () {
  debug('disconnected');
  eventHandlers.emit('disconnected');
});
client.on('message', function (message) {
  debug(`onMessage: ${message}`);
});
client.on('newRTCSession', function(e){
  debug(`newRTCSession: ${e}`);
});
client.on('registered', function() {
  debug('registered');
  eventHandlers.emit('started');
});

let randomSSRC = function() {
  return Math.floor(Math.random() * 2147483648);
}

let handleAnswer = function(answer) {
  debug(`handleAnswer: ${answer}`);
  let res = transform.parse(answer);
  debug(`handleAnswer: parsedAnswer=${JSON.stringify(res)}`);

  let rtpParams = {};

  // TOOD: wire this up and pass binding ports to ichabod
  rtpParams.audioRTCPMux = false;
  rtpParams.videoRTCPMux = false;

  if (res.connection && res.connection.ip) {
    rtpParams.audioHost = res.connection.ip;
    rtpParams.videoHost = res.connection.ip;
  }

  for (let i in res.media) {
    let media = res.media[i];
    if (media.rtcp && 'video' === media.type) {
      rtpParams.videoRTCPSendPort = media.rtcp.port;
      rtpParams.videoRTCPHost = media.rtcp.address;
    }
    if (media.rtcp && 'audio' === media.type) {
      rtpParams.audioRTCPSendPort = media.rtcp.port;
      rtpParams.audioRTCPHost = media.rtcp.address;
    }
    if ('video' === media.type) {
      rtpParams.videoSSRC = media.ssrcs ? media.ssrcs[0].id : randomSSRC();
      rtpParams.videoPort = media.port;
      if (!rtpParams.videoHost && media.connection) {
        rtpParams.videoHost = media.connection.ip;
      }
      rtpParams.videoPT = media.payloads;
    } else if ('audio' === media.type) {
      rtpParams.audioSSRC = media.ssrcs ? media.ssrcs[0].id : randomSSRC();
      rtpParams.audioPort = media.port;
      if (!rtpParams.audioHost && media.connection) {
        rtpParams.audioHost = media.connection.ip;
      }
      rtpParams.audioPT = media.payloads;
    }
  }

  if (!rtpParams.videoRTCPSendPort && !rtpParams.videoRTCPMux) {
    rtpParams.videoRTCPSendPort = rtpParams.videoPort + 1;
  }

  if (!rtpParams.audioRTCPSendPort && !rtpParams.audioRTCPMux) {
    rtpParams.audioRTCPSendPort = rtpParams.audioPort + 1;
  }

  rtpParams.videoRTPRecvPort = videoRecvRTPPort;
  rtpParams.videoRTCPRecvPort = videoRecvRTCPPort;
  rtpParams.audioRTPRecvPort = audioRecvRTPPort;
  rtpParams.audioRTCPRecvPort = audioRecvRTCPPort;

  debug(`handleAnswer: rtpParams=${JSON.stringify(rtpParams)}`);

  eventHandlers.emit('rtpOutputParams', rtpParams);

  // we don't need this signaling to start until after the call flow is
  // established. ideally this should be added dynamically after we know
  // good RTP traffic is up
  setTimeout(() => {
    reversePublisher.start();
  }, 15000);
};

const invite = function(uri) {
  debug(`invite: uri=${uri}`);
  client.call(uri, {
    mediaStream: {
      // shim this too probably
    },
    sessionTimersExpires: 120
  });
}

const hup = function() {
  // for all calls, send bye
  client.terminateSessions();
}

const on = function(event, handler) {
  eventHandlers.on(event, handler);
}

module.exports = {
  on,
  invite,
  start,
  hup
}