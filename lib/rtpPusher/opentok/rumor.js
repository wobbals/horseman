var RSVP = require('rsvp');
var _ = require('underscore');
var uuid = require('uuid');
var Transport = require('./transport').Transport;
var WebsocketTransport = require('./websocket').Transport;
var TextEncoder = require('text-encoding').TextEncoder;
var TextDecoder = require('text-encoding').TextDecoder;

var MessageType = {
  // This is used to subscribe to address/addresses. The address/addresses the
  // client specifies here is registered on the server. Once any message is sent to
  // that address/addresses, the client receives that message.
  SUBSCRIBE: 0,

  // This is used to unsubscribe to address / addresses. Once the client unsubscribe
  // to an address, it will stop getting messages sent to that address.
  UNSUBSCRIBE: 1,

  // This is used to send messages to arbitrary address/ addresses. Messages can be
  // anything and Rumor will not care about what is included.
  MESSAGE: 2,

  // This will be the first message that the client sends to the server. It includes
  // the uniqueId for that client connection and a disconnect_notify address that will
  // be notified once the client disconnects.
  CONNECT: 3,

  // This will be the message used by the server to notify an address that a
  // client disconnected.
  DISCONNECT: 4,

  //Enhancements to support Keepalives
  PING: 7,
  PONG: 8,
  STATUS: 9
};

var Message = function(type, toAddress, headers, data) {
  this.type = type;
  this.toAddress = toAddress;
  this.headers = headers;
  this.data = data;

  this.transactionId = this.headers['TRANSACTION-ID'];
  this.status = this.headers.STATUS;
  this.isError = !(this.status && this.status[0] === '2');
};

Message.prototype.serialize = function() {
  var offset = 8,
      cBuf = 7,
      address = [],
      headerKey = [],
      headerVal = [],
      strArray,
      dataView,
      i,
      j;

  // The number of addresses
  cBuf++;

  // Write out the address.
  for (i = 0; i < this.toAddress.length; i++) {
    /*jshint newcap:false */
    address.push(new TextEncoder('utf-8').encode(this.toAddress[i]));
    cBuf += 2;
    cBuf += address[i].length;
  }

  // The number of parameters
  cBuf++;

  // Write out the params
  i = 0;

  for (var key in this.headers) {
    if (!this.headers.hasOwnProperty(key)) {
      continue;
    }
    headerKey.push(new TextEncoder('utf-8').encode(key));
    headerVal.push(new TextEncoder('utf-8').encode(this.headers[key]));
    cBuf += 4;
    cBuf += headerKey[i].length;
    cBuf += headerVal[i].length;

    i++;
  }

  dataView = new TextEncoder('utf-8').encode(this.data);
  cBuf += dataView.length;

  // Let's allocate a binary blob of this size
  var buffer = new ArrayBuffer(cBuf);
  var uint8View = new Uint8Array(buffer, 0, cBuf);

  // We don't include the header in the lenght.
  cBuf -= 4;

  // Write out size (in network order)
  uint8View[0] = (cBuf & 0xFF000000) >>> 24;
  uint8View[1] = (cBuf & 0x00FF0000) >>> 16;
  uint8View[2] = (cBuf & 0x0000FF00) >>>  8;
  uint8View[3] = (cBuf & 0x000000FF) >>>  0;

  // Write out reserved bytes
  uint8View[4] = 0;
  uint8View[5] = 0;

  // Write out message type
  uint8View[6] = this.type;
  uint8View[7] = this.toAddress.length;

  // Now just copy over the encoded values..
  for (i = 0; i < address.length; i++) {
    strArray = address[i];
    uint8View[offset++] = strArray.length >> 8 & 0xFF;
    uint8View[offset++] = strArray.length >> 0 & 0xFF;
    for (j = 0; j < strArray.length; j++) {
      uint8View[offset++] = strArray[j];
    }
  }

  uint8View[offset++] = headerKey.length;

  // Write out the params
  for (i = 0; i < headerKey.length; i++) {
    strArray = headerKey[i];
    uint8View[offset++] = strArray.length >> 8 & 0xFF;
    uint8View[offset++] = strArray.length >> 0 & 0xFF;
    for (j = 0; j < strArray.length; j++) {
      uint8View[offset++] = strArray[j];
    }

    strArray = headerVal[i];
    uint8View[offset++] = strArray.length >> 8 & 0xFF;
    uint8View[offset++] = strArray.length >> 0 & 0xFF;
    for (j = 0; j < strArray.length; j++) {
      uint8View[offset++] = strArray[j];
    }
  }

  // And finally the data
  for (i = 0; i < dataView.length; i++) {
    uint8View[offset++] = dataView[i];
  }

  return buffer;
};

function toArrayBuffer(buffer) {
  var ab = new ArrayBuffer(buffer.length);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return ab;
}

Message.deserialize = function(buffer) {
  if (typeof Buffer !== 'undefined' &&
    Buffer.isBuffer(buffer)) {
    buffer = toArrayBuffer(buffer);
  }
  var cBuf = 0,
      type,
      offset = 8,
      uint8View = new Uint8Array(buffer),
      strView,
      headerlen,
      headers,
      keyStr,
      valStr,
      length,
      i;

  // Write out size (in network order)
  cBuf += uint8View[0] << 24;
  cBuf += uint8View[1] << 16;
  cBuf += uint8View[2] <<  8;
  cBuf += uint8View[3] <<  0;

  type = uint8View[6];
  var address = [];

  for (i = 0; i < uint8View[7]; i++) {
    length = uint8View[offset++] << 8;
    length += uint8View[offset++];
    strView = new Uint8Array(buffer, offset, length);
    /*jshint newcap:false */
    address[i] = new TextDecoder('utf-8').decode(strView);
    offset += length;
  }

  headerlen = uint8View[offset++];
  headers = {};

  for (i = 0; i < headerlen; i++) {
    length = uint8View[offset++] << 8;
    length += uint8View[offset++];
    strView = new Uint8Array(buffer, offset, length);
    keyStr = new TextDecoder('utf-8').decode(strView);
    offset += length;

    length = uint8View[offset++] << 8;
    length += uint8View[offset++];
    strView = new Uint8Array(buffer, offset, length);
    valStr = new TextDecoder('utf-8').decode(strView);
    headers[keyStr] = valStr;
    offset += length;
  }

  var dataView = new Uint8Array(buffer, offset);
  var data = new TextDecoder('utf-8').decode(dataView);

  return new Message(type, address, headers, data);
};

Message.Connect = function(uniqueId, notifyDisconnectAddress) {
  var headers = {
    uniqueId: uniqueId,
    notifyDisconnectAddress: notifyDisconnectAddress
  };
  return new Message(MessageType.CONNECT, [], headers, '');
};

Message.Disconnect = function() {
  return new Message(MessageType.DISCONNECT, [], {}, '');
};

Message.Subscribe = function(topics) {
  return new Message(MessageType.SUBSCRIBE, topics, {}, '');
};

Message.Unsubscribe = function(topics) {
  return new Message(MessageType.UNSUBSCRIBE, topics, {}, '');
};

Message.Message = function(topics, message, headers) {
  return new Message(MessageType.MESSAGE, topics, headers || {}, message || '');
};

// This message is used to implement keepalives on the persistent
// socket connection between the client and server. Every time the
// client sends a PING to the server, the server will respond with
// a PONG.
Message.Ping = function() {
  return new Message(MessageType.PING, [], {}, '');
};

function RumorTransport(options) {
  var HEADERS = {
    'Content-Type': 'application/x-raptor+v2',
    'X-TB-FROM-ADDRESS': options.id,
    'X-TB-TOKEN-AUTH': options.token
  };

  var transactions = {};

  var transport = Transport({
	  name: 'Rumor',
    create: function() { return WebsocketTransport(options); },
    log: options.log
  });
  transport.send = function(data) {
    var headers = _.extend(HEADERS, { 'TRANSACTION-ID': uuid.v4() });
    var msg = Message.Message([options.symphonyAddress], data, headers);
    options.log('RumorSend', { type: msg.type, tx: msg.transactionId });
    return new RSVP.Promise(function(resolve, reject) {
      transport.base.send(msg.serialize()).then(function() {
        transactions[msg.transactionId] = {
          callback: function(err, msg) { if (err) reject(err); else resolve(msg.data); },
          createdAt: new Date().getTime()
        };
        setTimeout(function() {
          var transactionId = msg.transactionId;
          if (transactions[transactionId]) {
            transactions[transactionId].callback(new Error('timeout'));
            delete transactions[transactionId];
          }
        }, 30000);
      }, reject);
    });
  }
  transport.base.on('connected', function() {
    transport.base.send(Message.Connect(options.id, '').serialize());
    //transport.base.send(Message.Subscribe([options.sessionId]).serialize());

    transport.emit('connected');
  });

  transport.base.on('close', function() {
    transport.emit('close');
  });

  var keepalive;
  transport.on('connected', function() {
    keepalive = setInterval(function() {
      transport.base.send(Message.Ping().serialize());
    }, 30000);
  });
  transport.close = function() {
    clearInterval(keepalive);

    transport.base.close();
  };

  transport.base.on('message', function(data) {
    var msg = Message.deserialize(data);
    if (msg.type == MessageType.PONG) {
      return;
    }

    options.log('RumorRecv', { type: msg.type, status: msg.status, tx: msg.transactionId });
    var transactionId = msg.transactionId;
    if (transactions[transactionId]) {
      transactions[transactionId].callback(null, msg);
      delete transactions[transactionId];
    }
    var content = msg.data;
    if (content) {
      transport.emit('message', content);
    }
  });

  return transport;
}

exports.Message = Message;
exports.Transport = RumorTransport;
