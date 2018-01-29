const os = require('os');
const debug = require('debug')('horseman:loadmon');

let dumpLoad = function() {
  debug(`load averages ${JSON.stringify(os.loadavg().map(x => x.toFixed(2)))} ` +
  `ncpu=${os.cpus().length} mfree=${(os.freemem()/1000000).toFixed(2)}`);
}

setInterval(dumpLoad, 5000);

module.exports = {
  dumpLoad
}