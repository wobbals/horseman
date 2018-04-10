const debug = require('debug')('sdpHelper');
const transform = require('sdp-transform');

let addMidLines = function(sdpIn) {
  let sdp = transform.parse(sdpIn);
  debug(`addMidLines: sdpIn=${JSON.stringify(sdp)}`);
  let midIndex = 0;
  for (let i in sdp.media) {
    let media = sdp.media[i];
    debug(`addMidLines: media=${JSON.stringify(media)}`);
    if (!media.mid) {
      media.mid = `${media.type}${midIndex++}`;
      debug(`addMidLines: adding mid line ${sdp.mid}`);
    }
  }
  debug(`addMidLines: sdpOut=${JSON.stringify(sdp)}`);
  return transform.write(sdp);
}

let extractSDPCandidates = function(sdpIn) {
  let sdp = transform.parse(sdpIn);
  debug(`extractSDPCandidates: sdp=${JSON.stringify(sdp)}`);
  let result = [];
  let midIndex = 0;
  for (let mLineIndex in sdp.media) {
    let media = sdp.media[mLineIndex];
    for (let candidateIndex in media.candidates) {
      let candidate = media.candidates[candidateIndex];

      //candidate:1796272311 1 UDP 2130706431 52.89.123.61 32808 typ host generation 0
      let candidateSdp = `candidate:${candidate.foundation} `+
      `${candidate.component} ${candidate.transport} ${candidate.priority} ` +
      `${candidate.ip} ${candidate.port} typ ${candidate.type} `+
      `generation ${candidate.generation}`;
      result.push({
        mLineIndex: mLineIndex,
        candidate: candidateSdp
      })
      debug(`extractSDPCandidates: mLineIndex=${mLineIndex} `+
        `candidate=${candidateSdp}`);
    }
  }

  return result;
}

module.exports = {
  addMidLines,
  extractSDPCandidates
}
