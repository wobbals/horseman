var RSVP = require('rsvp');
var _ = require('underscore');
var Transport = require('./transport').Transport;
var RumorTransport = require('./rumor').Transport;
var RumorMessage = require('./rumor').Message;

var Message = {};

Message.offer = function(uri, offerSdp, peerId, peerPriority) {
  return {
    method: 'offer',
    uri: uri,
    content: {
      peerPriority: peerPriority,
      peerId: peerId,
      sdp: offerSdp
    }
  };
};

Message.candidate = function(uri, candidate, sdpMid, sdpMLineIndex) {
  return {
    method: 'candidate',
    uri: uri,
    content: {
      candidate: candidate,
      sdpMid: sdpMid,
      sdpMLineIndex: sdpMLineIndex
    }
  }
}

Message.connections = {};

Message.connections.create = function(apiKey, sessionId, connectionId, userAgent) {
  return {
    method: 'create',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId + '/connection/' + connectionId,
    content: {
      userAgent: userAgent || 'node/0.0'
    }
  };
};

Message.connections.destroy = function(apiKey, sessionId, connectionId) {
  return {
    method: 'delete',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId + '/connection/' + connectionId,
    content: {}
  };
};

Message.sessions = {};

Message.sessions.get = function(apiKey, sessionId) {
  return {
    method: 'read',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId,
    content: {}
  };
};

Message.streams = {};

Message.streams.get = function(apiKey, sessionId, streamId) {
  return {
    method: 'read',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId + '/stream/' + streamId,
    content: {}
  };
};

Message.streams.channelFromOTChannel = function(channel) {
  var raptorChannel = {
    id: channel.id,
    type: channel.type,
    active: channel.active
  };

  if (channel.type === 'video') {
    raptorChannel.width = channel.width;
    raptorChannel.height = channel.height;
    raptorChannel.orientation = channel.orientation;
    raptorChannel.frameRate = channel.frameRate;
    if (channel.source !== 'default') {
      raptorChannel.source = channel.source;
    }
    raptorChannel.fitMode = channel.fitMode;
  }

  return raptorChannel;
};

Message.streams.create = function(apiKey, sessionId, streamId, name,
  audioFallbackEnabled, channels, minBitrate, maxBitrate) {
  var messageContent = {
    id: streamId,
    name: name,
    audioFallbackEnabled: audioFallbackEnabled,
    channel: _.each(channels, function(channel) {
      return Message.streams.channelFromOTChannel(channel);
    })
  };

  if (minBitrate) messageContent.minBitrate = minBitrate;
  if (maxBitrate) messageContent.maxBitrate = maxBitrate;

  return {
    method: 'create',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId + '/stream/' + streamId,
    content: messageContent
  };
};

Message.streams.destroy = function(apiKey, sessionId, streamId) {
  return {
    method: 'delete',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId + '/stream/' + streamId,
    content: {}
  };
};

Message.streams.answer = function(apiKey, sessionId, streamId, answerSdp, peerId, peerPriority) {
  return {
    method: 'answer',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId + '/stream/' + streamId,
    content: {
      peerPriority: peerPriority,
      peerId: peerId,
      sdp: answerSdp
    }
  };
};

Message.streams.candidate = function(apiKey, sessionId, streamId, candidate) {
  return {
    method: 'candidate',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId + '/stream/' + streamId,
    content: candidate
  };
};

Message.streamChannels = {};
Message.streamChannels.update =
  function(apiKey, sessionId, streamId, channelId, attributes) {
  return {
    method: 'update',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId + '/stream/' +
      streamId + '/channel/' + channelId,
    content: attributes
  };
};

Message.subscribers = {};

Message.subscribers.create =
  function(apiKey, sessionId, streamId, subscriberId, connectionId, channelsToSubscribeTo) {
  var content = {
    id: subscriberId,
    connection: connectionId
  };
  if (channelsToSubscribeTo) content.channel = channelsToSubscribeTo;

  return {
    method: 'create',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId +
      '/stream/' + streamId + '/subscriber/' + subscriberId,
    content: content
  };
};

Message.subscribers.destroy = function(apiKey, sessionId, streamId, subscriberId) {
  return {
    method: 'delete',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId +
      '/stream/' + streamId + '/subscriber/' + subscriberId,
    content: {}
  };
};

Message.subscribers.update =
  function(apiKey, sessionId, streamId, subscriberId, attributes) {
  return {
    method: 'update',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId +
    '/stream/' + streamId + '/subscriber/' + subscriberId,
    content: attributes
  };
};

Message.subscribers.candidate =
  function(apiKey, sessionId, streamId, subscriberId, candidate) {
  return {
    method: 'candidate',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId +
      '/stream/' + streamId + '/subscriber/' + subscriberId,
    content: candidate
  };
};

Message.subscribers.answer =
  function(apiKey, sessionId, streamId, subscriberId, answerSdp, peerId, peerPriority) {
  return {
    method: 'answer',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId +
    '/stream/' + streamId + '/subscriber/' + subscriberId,
    content: {
      peerPriority: peerPriority,
      peerId: peerId,
      sdp: answerSdp
    }
  };
};

Message.subscriberChannels = {};

Message.subscriberChannels.update =
  function(apiKey, sessionId, streamId, subscriberId, channelId, attributes) {
  return {
    method: 'update',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId +
    '/stream/' + streamId + '/subscriber/' + subscriberId + '/channel/' + channelId,
    content: attributes
  };
};

Message.signals = {};

Message.signals.create = function(apiKey, sessionId, toAddress, type, data) {
  var content = {};
  if (type !== void 0) content.type = type;
  if (data !== void 0) content.data = data;

  return {
    method: 'signal',
    uri: '/v2/partner/' + apiKey + '/session/' + sessionId +
      (toAddress !== void 0 ? '/connection/' + toAddress : '') + '/signal/' + OT.$.uuid(),
    content: content
  };
};

function RaptorTransport(options) {
  function serialize(msg) {
    return JSON.stringify(msg);
  }

  function deserialize(data) {
    return JSON.parse(data);
  }

  var transport = Transport({
    name: 'Raptor',
	  create: function() { return RumorTransport(options); },
    log: options.log
  });

  transport.base.on('connected', function() {
    var uri = '/v2/partner/' + options.apiKey + '/session/' + options.sessionId;
    transport.base.base.send(RumorMessage.Subscribe([uri]).serialize());

    var msg = Message.connections.create(options.apiKey, options.sessionId, options.id);
    transport.send(msg).then(function(status) {
      transport.emit('connected');
    }, function() {
      transport.close(new Error('Unable to create connection'));
    });
  });

  transport.base.on('close', function() {
    transport.emit('close');
  });

  transport.base.on('message', function(data) {
    var msg = deserialize(data);
    options.log('RaptorRecv', { method: msg.method, uri: msg.uri });

    transport.emit('message', msg);
    if (!msg.uri) {
      return;
    }

    transport.emit('resource#' + msg.uri, msg);
    var resource = 'session';
    if (msg.uri.indexOf('stream') !== -1) resource = 'stream';
    if (msg.uri.indexOf('subscriber') !== -1) resource = 'subscriber';
    if (msg.uri.indexOf('channel') !== -1) resource = 'channel';
    transport.emit(resource + '#' + msg.method, msg);
  });

  transport.send = function(msg) {
    options.log('RaptorSend', { method: msg.method, uri: msg.uri });

    return new RSVP.Promise(function(resolve, reject) {
      transport.base.send(serialize(msg)).then(function(data) {
        resolve(data ? deserialize(data) : null);
      }, reject);
    });
  };
  return transport;
}

exports.Message = Message;
exports.Transport = RaptorTransport;
