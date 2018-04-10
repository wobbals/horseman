const os = require('os');
const debug = require('debug')('horseman:loadmon');
const request = require('request');

let dumpLoad = function() {
  debug(`load averages ${JSON.stringify(os.loadavg().map(x => x.toFixed(2)))} ` +
  `ncpu=${os.cpus().length} mfree=${(os.freemem()/1000000).toFixed(2)}`);
}

let requestAndDumpMetadata = function(path) {
  let url = `http://169.254.169.254/latest/meta-data/${path}`;
  request(url, function (error, response, body) {
    let log = {
      path: path,
      error: error,
      statusCode: response && response.statusCode,
      body: body
    }
    debug(JSON.stringify(log));
  });
}

let dumpMetadata = function() {
  requestAndDumpMetadata("instance-id");
  requestAndDumpMetadata("instance-type");
  requestAndDumpMetadata("spot/instance-action");
  requestAndDumpMetadata("spot/termination-time");
  requestAndDumpMetadata("instance-action");
}

setInterval(dumpLoad, 5000);
setInterval(dumpMetadata, 5000);

module.exports = {
  dumpLoad
}