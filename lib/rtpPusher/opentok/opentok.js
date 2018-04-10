var RSVP = require('rsvp');
var _ = require('underscore');
var uuid = require('uuid');
var RaptorTransport = require('./raptor').Transport;
var RaptorMessage = require('./raptor').Message;
var Anvil = require('./anvil');
var Resource = require('./resource');
var Publisher = require('./publisher');
var Subscriber = require('./subscriber');

function Client(options) {
  var connectionId = options.connectionId || uuid.v4();
  var uri = '/v2/partner/' + options.apiKey + '/session/' + options.sessionId;
  var client = _.extend(Resource(connectionId, uri), {});

  var raptor;
  client.connect = function(sessionId, token) {
    var promise = new RSVP.Promise(function(resolve, reject) {
      Anvil.getSessionInfo(options).then(function(sessionInfo) {
        options = _.extend(options, {
          apiKey: sessionInfo.partner_id,
          id: connectionId,
          url: sessionInfo.messaging_url,
          symphonyAddress: sessionInfo.symphony_address
        });
        raptor = RaptorTransport(options);
        raptor.on('stream#created', function(msg) {
          if (msg.content.connection.id == connectionId) {
            return;
          }

          client.emit('stream#created', msg.content);
        });
        raptor.on('stream#deleted', function(msg) {
          client.emit('stream#deleted', msg.content);
        });
        raptor.on('close', function(msg) {
          client.emit('close', msg);
        });

        return raptor.connect();
      }).then(function() {
        client.getSessionState();
        resolve();
      }).catch(function(error) {
        reject(error);
      });
    });
    return promise;
  };

  client.getSessionState = function(pc) {
    var promise = new RSVP.Promise(function(resolve, reject) {
      var msg = RaptorMessage.sessions.get(options.apiKey, options.sessionId);
      raptor.send(msg).then(function(msg) {
        _.each(msg.content.stream, function(stream) {
          client.emit('stream#created', stream);
        });
        resolve(msg.content);
      }, reject);
    });
    return promise;
  };

  client.publish = function(constraints) {
	  var publisher = Publisher(raptor, _.extend(options, constraints));
    return publisher;
  };

  client.subscribe = function(constraints) {
	  var subscriber = Subscriber(raptor, _.extend(options, constraints));
    return subscriber;
  };

  client.disconnect = function() {
	  if (raptor) {
	    raptor.close();
	    // NO: It is hard to control who is using raptor object while closing
      // We keep it != null to avoid race conditions
      // and control the state inside the raptor objet itself
      // raptor = null;
	  }
  };

  return client;
}

module.exports = Client;
