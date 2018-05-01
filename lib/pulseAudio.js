const child_process = require('child_process');
const debug = require('debug')('horseman:pulseAudio');

let pid = function() {
  try {
    return child_process.execSync('pgrep pulseaudio');
  } catch (e) {
    return null;
  }
}

let server;

if (!pid()) {
  let args = [
    '-D', '--exit-idle-time=-1', '-vvvv', '--log-target=stderr'
  ];
  debug(`starting pulseaudio server daemon with args ${JSON.stringify(args)}`);
  server = child_process.spawn('pulseaudio', {
    args: args,
    detached: true
  });

  server.on('close', (code) => {
    debug(`child process exited with code ${code}`);
  });

  server.stdout.on('data', (data) => {
    debug(`stdout: ${data}`);
  });

  server.stderr.on('data', (data) => {
    debug(`stderr: ${data}`);
  });

}

debug(`pulseaudio running on pid ${pid()}`);

let kill = function() {
  debug("killing pulseaudio");
  try {
    return child_process.execSync('pkill pulseaudio');
  } catch (e) {
    return null;
  }
}

module.exports = {
  pid,
  kill
}
