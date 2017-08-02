const child_process = require('child_process');

var enable = function() {
  console.log("unmounting /dev/shm");
  child_process.execSync('umount /dev/shm');
  child_process.execSync('mount -t tmpfs -o rw,nosuid,nodev,noexec,relatime,size=512M tmpfs /dev/shm');
  console.log("remounted /dev/shm with a bit more memory");
}

module.exports = {
  enable
}
