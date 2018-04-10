var EventEmitter = require('events').EventEmitter;

module.exports = function(id, uri) {
  var events = new EventEmitter();
  var resource = {
	  id: id,
	  uri: uri,
    on: function(event, handler) {
      events.on(event, handler);
    },
	  off: function(event, handler) {
      events.off(event, handler);
    },
    emit: function() {
      events.emit.apply(events, arguments);
    }
  };
  return resource;
}
