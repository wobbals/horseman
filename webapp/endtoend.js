const request = require('request');
const ngrok = require('ngrok');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const httpPort = 8080;
const chai = require('chai');
chai.config.includeStack = true;
const expect = chai.expect;

let barcURL = 'https://46d39fab.ngrok.io/horseman';
let assertions = {
  callbackStates: {},
  pollStates: {}
};
let testJobId;
let testJobToken;
let startTime = new Date().getTime();

app.use(bodyParser.json());

app.post('/', function (req, res) {
  console.log('received request', req.body);
  let state = req.body.status;
  let jobId = req.body.jobId;
  if (state && !assertions.callbackStates[state]) {
    assertions.callbackStates[state] = new Date().getTime();
  }
  expect(jobId).to.equal(testJobId);
  res.status(204).send();
});

app.listen(httpPort, function () {
  console.log(`listening on port ${httpPort}`);
});

let body = {
  width: 640,
  height: 480,
  url: '"https://wobbals.github.io/horseman/viewer.html?env=tbdev&sessionId=2_MX40NDkzNTM0MX5-MTQzMjEzMzg0ODIwNn4xOW03WlA2NWwyM0RKS3Z0ZFpWN2FoVHR-fg&apiKey=44935341&token=T1==cGFydG5lcl9pZD00NDkzNTM0MSZzZGtfdmVyc2lvbj10YnBocC12MC45MS4yMDExLTA3LTA1JnNpZz1lNDg2NGQ0NTdkYWNhNGVmZDgwNDdhZjc3YzEzZmY3YzQ0YzBlN2NhOnNlc3Npb25faWQ9Ml9NWDQwTkRrek5UTTBNWDUtTVRRek1qRXpNemcwT0RJd05uNHhPVzAzV2xBMk5Xd3lNMFJLUzNaMFpGcFdOMkZvVkhSLWZnJmNyZWF0ZV90aW1lPTE0OTg3NjU3NDImcm9sZT1tb2RlcmF0b3Imbm9uY2U9MTQ5ODc2NTc0Mi41NjY0OTIzMTg5Njc2JmV4cGlyZV90aW1lPTE1MDEzNTc3NDI="',
};

let startNgrok = function() {
  return new Promise((resolve, reject) => {
    ngrok.connect(httpPort, (err, url) => {
      if (err) {
        reject(err);
      } else {
        resolve(url);
      }
    });
  });
}

let setupJobRequest = async function() {
  try {
    body.callbackURL = await startNgrok();
  } catch (e) {
    console.log(e);
    process.exit(-1);
  }
  console.log(`tunnel established on ${body.callbackURL}. requesting job`);

  request.post({
    url: `${barcURL}/job`,
    json: body
  }, (error, response, body) => {
    console.log('create job response', body);
    testJobId = body.jobId;
    testJobToken = body.accessToken;
  });
};

setupJobRequest().then(() => {
  console.log('test has started healthy');
});

let handleStatusCheck = async function(body) {
  let parsed = JSON.parse(body);
  console.log('job state', parsed);
  expect(parsed).to.have.property('status');
  if (!assertions.pollStates[parsed.status]) {
    assertions.pollStates[parsed.status] = new Date().getTime();
  }

  if ('complete' === parsed.status) {
    clearInterval(timer);
    let download = await checkDownload();
    console.log(download);
    checkAssertions();
    process.exit(0);
  } else {
    console.log(`T+${(new Date().getTime() - startTime)/1000}s: ` +
    `job state ${parsed.status}`);
  }
}

let periodic = async function() {
  if (testJobId && testJobToken) {
    request({
      url: `${barcURL}/job/${testJobId}?token=${testJobToken}`
    }, (error, response, body) => {
      handleStatusCheck(body);
    });
  }
};

let timer = setInterval(periodic, 1000);

let checkDownload = function() {
  return new Promise((resolve, reject) => {
    request.get({
      url: `${barcURL}/job/${testJobId}/download?token=${testJobToken}`
    }, (error, response, body) => {
      if (error) {
        reject(error);
      } else {
        resolve(body);
      }
    });
  });
};

let checkAssertions = function() {
  console.log(assertions);

  expect(assertions.callbackStates).to.have.property('launched');
  expect(assertions.callbackStates).to.have.property('processing');
  expect(assertions.callbackStates).to.have.property('uploading');
  expect(assertions.callbackStates).to.have.property('complete');

  expect(assertions.callbackStates.launched).to.be
  .below(assertions.callbackStates.processing);

  expect(assertions.callbackStates.processing).to.be
  .below(assertions.callbackStates.uploading);

  expect(assertions.callbackStates.uploading).to.be
  .below(assertions.callbackStates.complete);

  expect(assertions.pollStates).to.have.property('queued');
  expect(assertions.pollStates).to.have.property('processing');
  expect(assertions.pollStates).to.have.property('complete');

  //sometimes launched state is too fast to catch
  if (assertions.pollStates.launched) {
    expect(assertions.pollStates.queued).to.be
    .below(assertions.pollStates.launched);

    expect(assertions.pollStates.launched).to.be
    .below(assertions.pollStates.processing);
  } else {
    expect(assertions.pollStates.queued).to.be
    .below(assertions.pollStates.processing);
  }
  expect(assertions.pollStates.processing).to.be
  .below(assertions.pollStates.complete);
}