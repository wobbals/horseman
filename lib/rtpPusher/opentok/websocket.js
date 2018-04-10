var RSVP = require('rsvp');
var Transport = require('./transport').Transport;
var WebSocket = require('ws');

function WebsocketTransport(options) {
  var WebSocketClass = options.WebSocketClass || WebSocket;
  var transport = Transport({
    name: 'Websocket',
	  create: function() { return new WebSocketClass(options.url); },
	  serialize: function(data) { return data; },
	  deserialize: function(data) { return data; },
    log: options.log
  });
  transport.base.on('open', function() {
	  transport.emit('connected');
  });
  transport.base.on('message', function(msg) {
	  transport.emit('message', msg);
  });
  transport.base.on('close', function() {
    transport.emit('close');
  });
  transport.send = function(data) {
    return new RSVP.Promise(function(resolve, reject) {
      var ws = transport.base;
      if (ws.readyState !== WebSocket.OPEN) {
        options.log('SendingClosed');

        return reject(new Error('Disconnected socket'));
      }
      ws.send(data, { binary: true }, function() {});
      resolve();
    });
  }

  return transport;
}

exports.Transport = WebsocketTransport;
