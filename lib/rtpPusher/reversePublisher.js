const os = require('os');
const debug = require('debug')('horseman:rtpPusher:reversePublisher');
const rtpCtrl = require('./rtpCtrl');
const sdpHelper = require('./sdpHelper');
const uuid = require('uuid');
const OpenTok = require("./opentok/opentok.js");

const sessionId = process.env.SESSION_ID;
const token = process.env.TOKEN;

class DeferredPromise {
  constructor() {
    this._promise = new Promise((resolve, reject) => {
      // assign the resolve and reject functions to `this`
      // making them usable on the class instance
      this.resolve = resolve;
      this.reject = reject;
    });
    // bind `then` and `catch` to implement the same interface as Promise
    this.then = this._promise.then.bind(this._promise);
    this.catch = this._promise.catch.bind(this._promise);
    this[Symbol.toStringTag] = 'Promise';
  }
}
let offerPromise = new DeferredPromise();
let rtpCtrlStarted;

rtpCtrl.on('offer', (offer) => {
  offerPromise.resolve({
    type: 'offer',
    sdp: offer
  });
});

let pc = {
  // build this from rtcShim
};

let ot = OpenTok({
  apiKey: 100,
  sessionId: sessionId,
  token: token,
  log: function(action, args) {
    debug(action, args);
  },
  apiUrl: "https://anvil-tbdev.opentok.com"
});

let start = async function() {
  try {
    await ot.connect();
    await rtpCtrl.start();
    let streamId = uuid.v4();
    var publisher = ot.publish({ audio: true, video: true, pc: pc, streamId });

    rtpCtrl.on('icecandidate', (sdpMLineIndex, candidate) => {
      let sdpMid;
      // TODO: extract from offer and perform a proper lookup
      if ('1' === `${sdpMLineIndex}`) {
        sdpMid = 'audio';
      } else {
        sdpMid = 'video';
      }
      debug(`onicecandidate: sdpMLineIndex=${sdpMLineIndex}, `+
        `sdpMid=${sdpMid}, candidate=${candidate}`);
      publisher.candidate(candidate, sdpMid, sdpMLineIndex);
    });

    publisher.on('created', function() {
      debug(`publisherCreated`);
    });
    publisher.on('generateoffer', async function(peerId, peerPriority) {
      debug(`publisher.generateOffer: peerId=${peerId}, peerPriority=${peerPriority}`);
      rtpCtrl.createOffer();
      let offer = await offerPromise;
      publisher.offer(offer.sdp.toString(), peerId, peerPriority);
    });
    publisher.on('answer', function(answer, peerId, peerPriority) {
      debug(`publisher.answer: answer=${answer}, peerId=${peerId}, peerPriority=${peerPriority}`);
      let candidates = sdpHelper.extractSDPCandidates(answer);
      rtpCtrl.setRemoteDescription(answer);
      for (let i in candidates) {
        let candidate = candidates[i];
        rtpCtrl.addRemoteCandidate(candidate.mLineIndex, candidate.candidate);
      }
    });
  } catch (e) {
    debug(e);
  }
}

module.exports = {
  start
}
