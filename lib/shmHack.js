const child_process = require('child_process');

var enable = function() {
  let available = parseInt(
    child_process.execSync("df /dev/shm | grep shm | awk '{print $4}';")
  );
  console.log(`detected ${available} bytes available scratch space`);
  if (available > 524000) {
    return;
  }
  console.log("unmounting /dev/shm");
  child_process.execSync('umount /dev/shm');
  child_process.execSync('mount -t tmpfs -o rw,nosuid,nodev,noexec,relatime,size=512M tmpfs /dev/shm');
  console.log("remounted /dev/shm with a bit more memory");
}

module.exports = {
  enable
}
