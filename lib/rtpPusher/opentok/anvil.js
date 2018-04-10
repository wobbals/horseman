var RSVP = require('rsvp');
var request = require('request');

function getSessionInfo(options) {
  var sessionId = options.sessionId;
  var token = options.token;
  var url = options.apiUrl + '/session/' + sessionId + '?version=1&format=json&token=' + token;
  options.log('GetSessionInfoBegin', { sessionId: sessionId, url: url });
  var promise = new RSVP.Promise(function(resolve, reject) {
    request(url, { json: true }, function(err, response, body) {
      var success = !err && response.statusCode == 200 && body[0];
      var server = success ? body[0].media_server_hostname : '';
      options.log('GetSessionInfoEnd', { sessionId: sessionId, status: err ? -1 : response.statusCode, server: server, err: err });
      if (success) {
        resolve(body[0]);
      } else {
        reject(new Error('Unable to GetSessionInfo'));
      }
    });
  });
  return promise;
};

exports.getSessionInfo = getSessionInfo;
