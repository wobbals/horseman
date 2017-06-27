const child_process = require('child_process');

let pid = function() {
  try {
    return child_process.execSync('pgrep pulseaudio');
  } catch (e) {
    return null;
  }
}
if (!pid()) {
  console.log("starting pulseaudio server daemon");
  let server = child_process.spawn('pulseaudio', {
    args: [ '-D', '--exit-idle-time=-1' ]
  });
}
console.log(`pulseaudio running on pid ${pid()}`);

let kill = function() {
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
