const remoteContainer = "otRemoteRecordingStreams";
const revalDebug = require('debug')('horseman:headless:injection:reval');
const debug = require('debug')('horseman:headless:injection');

let Runtime;

let reval = async function(script) {
  if (process.env.REVAL_VERBOSE) {
    revalDebug("Remote evaluate script ", script);
  }
  let result = await Runtime.evaluate({
    expression: script
  });
  if (result.exceptionDetails) {
    revalDebug("Exception: ", result);
    process.exit(-1);
  } else if (process.env.REVAL_VERBOSE) {
    revalDebug('result:', result);
  }
  return result;
}

let initializeRemoteRecording = async function(R) {
  try {
    Runtime = R;
    let result = await reval(
      `var s = document.createElement("script");` +
      `s.type = "text/javascript";` +
      `s.src = "https://localhost:3001/inject.js";` +
      `document.body.appendChild(s);`
    );
  } catch (e) {
    console.log("initializeRemoteRecording: ", e);
  }
}

let destroy = function() {
  // I don't know, maybe try to destroy the remote node?
}

module.exports = {
  initializeRemoteRecording,
  destroy
}