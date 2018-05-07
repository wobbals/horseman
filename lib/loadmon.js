const os = require('os');
const debug = require('debug')('horseman:loadmon');
const request = require('request');

let dumpLoad = function() {
  debug(`load averages ${JSON.stringify(os.loadavg().map(x => x.toFixed(2)))} ` +
  `ncpu=${os.cpus().length} mfree=${(os.freemem()/1000000).toFixed(2)}`);
}

let requestAndDumpMetadata = function(path) {
  let url = `http://169.254.169.254/latest/meta-data/${path}`;
  return new Promise((resolve, reject) => {
    request(url, function (error, response, body) {
      let log = {
        path: path,
        error: error,
        statusCode: response && response.statusCode,
        body: body
      }
      resolve(log);
    });
  });
}

let dumpMetadata = async function() {
  let requests = [
    'instance-id',
    'instance-type',
    'spot/instance-action',
    'spot/termination-time',
    'instance-action',
    'public-ipv4'
  ];
  let promises = [];
  for (let i in requests) {
    promises.push(requestAndDumpMetadata(requests[i]))
  }
  let results = await Promise.all(promises);
  debug(JSON.stringify(results));
}

setInterval(dumpLoad, 5000);
setInterval(dumpMetadata, 5000);

module.exports = {
  dumpLoad
}