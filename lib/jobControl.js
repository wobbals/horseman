/*
Establish connection with a control server and await control messages.
Asserts this process does not last for too long.
*/

const WebSocket = require('ws');
const debug = require('debug')('horseman:jobControl');

let ws;
let remoteStopCallback;
let remoteStartCallback;

let onRemoteStop = function(callback) {
  remoteStopCallback = callback;
}

let onRemoteStart = function(callback) {
  remoteStartCallback = callback;
}

let tryStop = function() {
  if (remoteStopCallback) {
    remoteStopCallback();
  } else {
    debug("Warning: no remote stop callback. Terminating in 30 seconds.");
    setTimeout(() => {
      process.exit(0);
    }, 30000);
  }
}

let tryStart = function() {
  if (remoteStartCallback) {
    remoteStartCallback();
  } else {
    debug("warning: no remote start callback. aborting job.");
    process.exit(0);
  }
}

let connect = function(remoteServerURL, taskId) {
  ws = new WebSocket(remoteServerURL);

  ws.on('open', function open() {
    debug(`opened connection to remote control server at ${remoteServerURL}`);
    ws.send(taskId);
  });

  ws.on('message', function incoming(data) {
    debug(data);
    if ('stop' === data) {
      tryStop();
    }
    if ('start' === data) {
      tryStart();
    }
  });

  ws.on('error', function(err) {
    debug(err.message);
  });
}

function maxDuration() {
  return process.env.MAX_DURATION || 21600;
}

let timeoutFunction = function() {
  debug("exceeded max job duration soft limit. interrupting.");

  setTimeout(() => {
    debug("exceeded max job duration hard limit. killing.");
    process.exit(1);
  }, 60000);

  try {
    tryStop();
  } catch (e) {
    debug('uncaught exception on timeout handler: ', e);
  }
}


let mainTimer = null;

let resetTimeout = function() {
  debug('resetTimeout');
  if (mainTimer) {
    clearTimeout(mainTimer);
    mainTimer = null;
  }
  mainTimer = setTimeout(timeoutFunction, maxDuration() * 1000);
}

let pauseTimeout = function() {
  debug('pauseTimeout');
  clearTimeout(mainTimer);
  mainTimer = null;
}

if (!process.env.MAX_DURATION) {
  debug("Warning: MAX_DURATION is unset. Using 6 hours.");
} else {
  debug(`setting max duration from environment config: `+
    `${process.env.MAX_DURATION} seconds`)
}

resetTimeout();

module.exports = {
  connect,
  onRemoteStop,
  onRemoteStart,
  pauseTimeout,
  resetTimeout
}
