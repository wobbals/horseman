const child_process = require('child_process');
const fs = require('fs');
const EventEmitter = require('events');
const debug = require('debug')('horseman:ichabod_ctrl');
const zmq = require('zeromq');
const mediaQueue = zmq.socket('push');
mediaQueue.bindSync('ipc:///tmp/horseman-push');

let eventHandlers = new EventEmitter();

let ichabod_path = process.env.ICHABOD || 'ichabod';
let ichabod_pid;
let ichabod;

function spawn(opts) {
  debug(`spawn: attempting launch of subprocess '${ichabod_path}'`);
  if (!process.env.GST_DEBUG) {
    process.env['GST_DEBUG'] = '*:4';
  }
  debug(`spawn: GST_DEBUG is ${process.env.GST_DEBUG}`);
  let logPath;
  if (opts.logPath) {
    logPath = opts.logPath;
  } else {
    logPath = './ichabod.log'
  }
  const out = fs.openSync(logPath, 'w');
  let args = [];
  if (opts.output) {
    args.push('-o');
    args.push(opts.output);
  }
  // if (process.env.BROADCAST_URL) {
  //   setTimeout(() => {
  //     debug(`ASYNC OUTPUT STARTS NOW`);
  //     mediaQueue.send(['output', 'rtmp', process.env.BROADCAST_URL]);
  //   }, 30000);
  // }
  if (opts.broadcast) {
    args.push('-b');
    args.push(opts.broadcast);
  }

  debug("spawn: args: ", args);
  ichabod = child_process.spawn(
    ichabod_path,
    args
  );
  ichabod.stdout.on('data', (data) => {
    fs.write(out, data.toString(), function(err, written, string) {

    });
  });
  ichabod.stderr.on('data', (data) => {
    fs.write(out, data.toString(), function(err, written, string) {

    });
  });
  ichabod.on('error', (err) => {
    debug('spawn: ichabod failed to launch', err);
  });
  ichabod.on('close', (code) => {
    debug(`spawn: child ichabod exited with code ${code}`);
    ichabod_pid = false;
    eventHandlers.emit('exit');
  });
  ichabod_pid = ichabod.pid;
}

if (!ichabod_path) {
  try {
    ichabod_path = child_process.execSync('which ichabod');
  } catch (e) { }
}

if (!ichabod_path && !pid()) {
  debug(`panic: no running ichabod and no known binary.`);
  process.exit(1);
}

let launch = function(opts) {
  if (pid()) {
    debug(`found existing ichabod ${ichabod_pid}`);
    debug(`opts ignored!`, opts);
  } else {
    spawn(opts);
  }
}

let interrupt = function() {
  try {
    process.kill(ichabod_pid, 'SIGINT');
  } catch (e) { }
}

let pid = function() {
  try {
    ichabod_pid = child_process.execSync('pgrep ichabod');
  } catch (e) {
    ichabod_pid = null;
  }
  debug(`pid: found ichabod pid ${ichabod_pid}`);
  return ichabod_pid;
}

let sendEOS = function() {
  debug("sendEOS");
  mediaQueue.send(["frame", "EOS"]);
}

let sendFrame = function(args) {
  mediaQueue.send(["frame", args.data, args.timestamp]);
}

let on = function(event, handler) {
  eventHandlers.on(event, handler);
}

module.exports = {
  launch,
  interrupt,
  pid,
  on,
  sendEOS,
  sendFrame
};
