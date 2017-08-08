const debug = require('debug')('horseman:remoteControl');
const validator = require('validator');

let wss;
let jobRemoteSockets = {};

function getClientIp(req) {
  var ipAddress;
  // The request may be forwarded from local web server.
  var forwardedIpsStr = req.headers['x-forwarded-for']; 
  if (forwardedIpsStr) {
    // 'x-forwarded-for' header may return multiple IP addresses in
    // the format: "client IP, proxy 1 IP, proxy 2 IP" so take the
    // the first one
    var forwardedIps = forwardedIpsStr.split(',');
    ipAddress = forwardedIps[0];
  }
  if (!ipAddress) {
    // If request was not forwarded
    ipAddress = req.connection.remoteAddress;
  }
  return ipAddress;
};

let onMessage = function(ws, msg) {
  debug('received: %s', msg);
  if (validator.isUUID(msg)) {
    ws.taskId = msg;
  }
  jobRemoteSockets[msg] = ws;
}

let onConnection = function(ws, request) {
  debug(`ws connection opened from ${getClientIp(request)}`);
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (message) => { onMessage(ws, message); });
}

let setupServer = function(server) {
  wss = server
  wss.on('connection', onConnection);
  debug('remote control server is ready');
}

let terminateJob = function(jobId) {
  if (jobRemoteSockets[jobId]) {
    debug('sending stop request to ' + jobId);
    jobRemoteSockets[jobId].send('stop');
    return true;
  } else {
    debug(`terminateJob: no socket for job ${jobId}`);
    return false;
  }
}

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      debug(`timeout interval: purge websocket for task ${ws.taskId}`);
      delete jobRemoteSockets[ws.taskId];
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping('', false, true);
  });
}, 15000);

module.exports = {
  setupServer,
  terminateJob
}
