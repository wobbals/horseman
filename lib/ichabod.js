const child_process = require('child_process');
const fs = require('fs');
let ichabod_path = process.env.ICHABOD || 'ichabod';
let ichabod_pid;
let ichabod;

let interruptSelf = function() {
  console.log('interruptSelf');
  process.kill(process.pid, 'SIGINT');
}

try {
  ichabod_pid = child_process.execSync('pgrep ichabod');
} catch (e) { }

function spawn(opts) {
  console.log(`attempting launch of subprocess '${ichabod_path}'`);
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
  console.log("args: ", args);
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
    console.log('ichabod failed to launch', err);
  });
  ichabod.on('close', (code) => {
    console.log(`child ichabod exited with code ${code}`);
    ichabod_pid = false;
    interruptSelf();
  });
  ichabod_pid = ichabod.pid;
}

if (!ichabod_path) {
  try {
    ichabod_path = child_process.execSync('which ichabod');
  } catch (e) { }
}

if (!ichabod_pid && !ichabod_path) {
  console.log(`no running ichabod and no known binary. `+
    `this aggression will not stand, man.`);
  process.exit(1);
}

let launch = function(opts) {
  if (ichabod_pid) {
    console.log(`found existing ichabod ${ichabod_pid}`);
    console.log(`opts ignored!`, opts);
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
  console.log(`found ichabod pid ${ichabod_pid}`);
  return ichabod_pid;
}

module.exports = {
  launch,
  interrupt,
  pid
};
