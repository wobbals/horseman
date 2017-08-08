/* 
Establish connection with a control server and await control messages.
Asserts this process does not last for too long.
*/

const WebSocket = require('ws');
const debug = require('debug')('horseman:jobControl');

let ws;
let remoteStopCallback;

let onRemoteStop = function(callback) {
  remoteStopCallback = callback;
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
  });
}

function maxDuration() {
  if (!process.env.MAX_DURATION) {
    debug("Warning: MAX_DURATION is unset. Using 6 hours.");
  } else {
    debug(`setting max duration from environment config: `+
      `${process.env.MAX_DURATION} seconds`)
  }
  return process.env.MAX_DURATION || 21600;
}

setTimeout(() => {
  debug("exceeded max job duration hard limit. killing.");
  process.exit(1);
}, maxDuration() * 1000);

setTimeout(() => {
  debug("exceeded max job duration soft limit. interrupting.");
  tryStop();
}, (maxDuration() - 60) * 1000);

module.exports = {
  connect, 
  onRemoteStop
}
