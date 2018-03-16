var debug = require('debug')('horsemanws:job_helper');
var validator = require('validator');
var config = require('config');
var hash_generator = require('random-hash-generator');
var AWS = require('aws-sdk');
var s3_client = new AWS.S3({
    accessKeyId: config.get("aws_token"),
    secretAccessKey: config.get("aws_secret"),
    region: config.get("s3_region")
});
var Job = require('../model/job');
var request = require('request');

var tryPostback = function(callbackURL, message) {
  if (!callbackURL || !validator.isURL(callbackURL)) {
    debug(`tryPostback: invalid URL ${callbackURL}`);
    return;
  }
  var postback_options = {
    uri: callbackURL,
    method: 'POST',
    json: message
  };
  debug(`tryPostback: ${JSON.stringify(postback_options)}`);
  request(postback_options, function(error, response, body) {
    debug(`Postback to ${callbackURL} returned code ${response.statusCode}`);
  });
}

var tryExternalPostback = async function(taskId, message) {
  let job;
  try {
    job = await Job.getJob(taskId);
  } catch (e) {
    debug(`tryExternalPostback: `, e);
    return;
  }
  if (!job) {
    debug(`tryExternalPostback: no job ${taskId}`);
    return;
  }
  tryPostback(job.externalCallbackURL, message)
}

var handlePostback = async function(body) {
  debug(`handlePostback:`, body);
  if (!body.message || !body.taskId) {
    return;
  }
  let taskId = body.taskId;
  let message = body.message;
  let jobData = {
    lastMessage: new Date().getTime()
  };
  if (message.output_key) {
    jobData.archiveKey = message.output_key;
  }
  if (message.output_bucket) {
    jobData.archiveBucket = message.output_bucket;
  }
  if (message.logs_key) {
    jobData.logsKey = message.logs_key;
  }
  if (message.logs_bucket) {
    jobData.logsBucket = message.logs_bucket;
  }
  if (message.error) {
    jobData.error = JSON.stringify(message.error);
  }
  if (message.status) {
    jobData.status = message.status;
  }
  if (message.progress) {
    jobData.progress = message.progress;
  }
  debug(`handlePostback: persist job data`, jobData);
  try {
    await Job.persist(taskId, jobData);
  } catch (e) {
    debug('handlePostback:', e);
    debug(e.stack);
  }
  if (message.status) {
    tryExternalPostback(taskId, {status: message.status, jobId: taskId});
  }
}
module.exports.handlePostback = handlePostback;

var parseJobArgs = function(args) {
  var result = {}

  // required parameters first
  if (args.url && validator.isURL(args.url, {
    protocols: ['http','https']
  })) {
    result.url = validator.stripLow(args.url);
  } else {
    result.error = "Missing required parameter: url"
    return result;
  }

  // required parameters first
  if (args.broadcastURL && validator.isURL(args.broadcastURL, {
    protocols: ['rtmp']
  })) {
    result.broadcastURL = validator.stripLow(args.broadcastURL);
  }

  if (args.sipDialout && validator.isSipURI(args.sipDialout)) {
    result.sipDialout = validator.stripLow(args.sipDialout);
  }

  if (validator.isInt(args.width + '', {
    min: config.get("job_limits.min_width"),
    max: config.get("job_limits.max_width")
  })) {
    result.width = parseInt(args.width);
  } else {
    result.width = config.get("job_defaults.width");
  }

  if (validator.isInt(args.height + '', {
    min: config.get("job_limits.min_height"),
    max: config.get("job_limits.max_height")
  })) {
    result.height = parseInt(args.height);
  } else {
    result.height = config.get("job_defaults.height");
  }

  if (args.callbackURL && validator.isURL(args.callbackURL)) {
    result.externalCallbackURL = args.callbackURL;
  }

  if (validator.isInt(args.maxDuration + '', {
    min: 0,
    max: config.get('job_limits.max_duration')
  })) {
    result.maxDuration = parseInt(args.maxDuration);
  } else {
    result.maxDuration = config.get('job_defaults.duration');
  }

  if (validator.isBoolean(args.autostart + '')) {
    result.autostart = args.autostart + '' == 'true';
  } else {
    result.autostart = config.get('job_defaults.autostart');
  }

  // Accept ISO8601 and unix epoch times
  if (validator.isISO8601(`${args.launchTime}`)) {
    result.launchTime = `${args.launchTime}`;
  } else if (validator.isInt(`${args.launchTime}`)) {
    result.launchTime = new Date(args.launchTime).toISOString();
  } else {
    result.launchTime = 'immediate';
  }

  if (validator.isBoolean(args.individualStreamRecord + '')) {
    result.individualStreamRecord = args.individualStreamRecord;
  }

  // intercept old external callback URL with our own internal endpoint
  result.callbackURL = config.get('internal_callback_base_url');
  result.remoteControlURL = config.get('internal_control_socket_url');

  return result;
}

/* To be compatible with JS minimist, please use longopt format */
var taskize = function(requestArgs) {
  let args = ['node', 'app.js'];
  if (requestArgs.width) {
    args.push(`--width`);
    args.push(`${parseInt(requestArgs.width)}`);
  }
  if (requestArgs.height) {
    args.push(`--height`);
    args.push(`${parseInt(requestArgs.height)}`);
  }
  if (requestArgs.url) {
    args.push(`--url`);
    args.push(`${requestArgs.url}`);
  }
  return args;
}
module.exports.taskize = taskize;

var validateJobToken = function(job, token) {
  var calculated_secret = hash_generator.calc(token,
    config.get("secret_token_length"),
    config.get("secret_token_salt")
  );
  return (job.data.secret === calculated_secret);
}

var getJobDownloadURL = function(key) {
  return new Promise((resolve, reject) => {
    var params = {
      Bucket: config.get("s3_bucket"),
      Key: key,
      Expires: 600 // 10 minutes
    };
    s3_client.getSignedUrl('getObject', params, function (err, url) {
      if (err) {
        debug(`getJobDownloadURL: `, err);
        reject(err);
      } else {
        resolve(url);
      }
    });
  });
}

module.exports.getJobDownloadURL = getJobDownloadURL;
module.exports.validateJobToken = validateJobToken;
module.exports.parseJobArgs = parseJobArgs;