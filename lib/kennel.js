const debug = require('debug')('horseman:kennel');
const validator = require('validator');
const request = require('request');

const callbackURL = process.env.CALLBACK_URL;
debug(`Using callback URL ${callbackURL}`);

let tryPostback = function(taskId, message) {
  debug(`tryPostback: message=${JSON.stringify(message)}`);
  if (!callbackURL || !validator.isURL(callbackURL)) {
    debug(`tryPostback: invalid URL ${callbackURL}`);
    return;
  }
  let postback_options = {
    uri: callbackURL,
    method: 'POST',
    json: {
      taskId: `${taskId}`,
      message: message
    }
  };
  debug(`tryPostback: ${JSON.stringify(postback_options)}`);
  request(postback_options, function(error, response, body) {
    if (error) {
      debug(`Postback to ${callbackURL} returned error ${error}`);
    } else {
      debug(`Postback to ${callbackURL} returned code ${response.statusCode}`);
    }
  });
}

module.exports = {
  tryPostback
}
