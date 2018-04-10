var RSVP = require('rsvp');
var EventEmitter = require('events').EventEmitter;

function Transport(options) {
  var base = options.create();
  var events = new EventEmitter();
  var transport = {
	base: base,
	connect: function() {
	  options.log(options.name + 'ConnectBegin');
    var promise = new RSVP.Promise(function(resolve, reject) {
      var connecting = true;
      events.on('connected', function() {
        connecting = false;
        resolve();
      });
      events.on('close', function(err) {
        if (connecting) {
          connecting = false;
          reject(err);
        }
      });

      if (!base) {
        reject();
        return;
      }
      transport.emit('connecting');

      if (base.connect) {
        base.connect();
      }
	  });
	  promise.then(function() {
		  options.log(options.name + 'ConnectEnd');
	  }, function(err) {
		  options.log(options.name + 'ConnectEnd', { err: err });
	  })
	  return promise;
	},
	close: function() {
    transport.base.close();
	},
	send: function(data) {
		base.send(data, { binary: true }, function() {});
	},
	on: function(event, handler) {
	  events.on(event, handler);
	},
	emit: function() {
    events.emit.apply(events, arguments);
	}
  };

  return transport;
}

exports.Transport = Transport;
