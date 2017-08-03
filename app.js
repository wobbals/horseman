const path = require('path');
const fs = require('fs');
console.log(`detected platform ${process.platform}`);
if ('linux' === `${process.platform}`) {
  const shm = require('./lib/shmHack');
  shm.enable();  
}
const ChromeLauncher = require('chrome-launcher');
const chrome = require('chrome-remote-interface');
const zmq = require('zeromq');
const validator = require('validator');
const uuid = require('uuid/v4')
const mediaQueue = zmq.socket('push');
mediaQueue.bindSync('ipc:///tmp/ichabod-screencast');

const ichabod = require('./lib/ichabod');
const pulse = require('./lib/pulseAudio');
const uploader = require('./lib/uploader');
const kennel = require('./lib/kennel');
const headless = require('./lib/headless');

const taskId = process.env.TASK_ID || uuid();
console.log(`Using taskId ${taskId}`);

let outfileName;
if (process.env.BROADCAST_URL) {
  outfileName = process.env.BROADCAST_URL;
} else {
  outfileName = `${process.cwd()}/${taskId}.mp4`;
}
const logPath = `${process.cwd()}/${taskId}.log`;

var argv = require('minimist')(process.argv.slice(2));
if (!argv.width) {
  argv.width = 640;
}
if (!argv.height) {
  argv.height = 480;
}
if (!argv.url || !validator.isURL(`${argv.url}`)) {
  console.log(`missing parameter: --url`);
  process.exit(1);
}

console.dir(argv);

let lastScreencastLogTime = new Date();
let frameCount = 0;
function sendScreencastFrame(data, timestamp) {
  frameCount++;
  try {
    mediaQueue.send([data, new Date(timestamp * 1000).getTime()]);
    let delta = (new Date() - lastScreencastLogTime) / 1000;
    if (delta > 5) {
      console.log(
        `sent ${frameCount} screencast frames in ${delta} seconds `+
        `(avg ${frameCount / delta} fps)`
      );
      lastScreencastLogTime = new Date();
      frameCount = 0;
    }
  } catch (e) {
    console.log('tickScreenshot', e);
  }
}

function onConsole(e) {
  console.log("consoleEvent: ", e);
}

function onException(e) {
  console.log("remote Exception Event", e);
}

function onLogEntry(e) {
  console.log("log entry", e);
}

var launcher;

async function main() {
  kennel.tryPostback(taskId, {status: 'initializing'});
  try {
    headless.onScreencastFrame((event) => {
      sendScreencastFrame(event.data, event.metadata.timestamp);
    });
    await headless.launch(argv.url, argv.width, argv.height);
    ichabod.launch({
      output: outfileName,
      logPath: logPath
    });
    kennel.tryPostback(taskId, {status: 'recording'});
  } catch (e) {
    console.log('main: ', e);
  }
}

let interruptCount = 0;
let uploadRequested = false;
let onInterrupt = () => {
  headless.kill();
  if (interruptCount > 3) {
    console.log(`received ${interruptCount} interrupt signals. exiting.`);
    kennel.tryPostback(taskId, {
      causedBy: "interrupted",
      status: 'error',
      error: 'interrupted'
    });
    process.exit(2);
  }
  if (ichabod.pid()) {
    console.log(`sending interrupt to ichabod (pid=${ichabod.pid()})`);
    ichabod.interrupt();
    console.log("waiting for ichabod to exit");
  } else if (!uploadRequested) {
    uploadRequested = true;
    kennel.tryPostback(taskId, {status: 'uploading'});
    uploader.upload(taskId, outfileName, (archiveKey, err) => {
      if (!err) {
        kennel.tryPostback(taskId, {
          output_key: archiveKey,
          output_bucket: process.env.S3_BUCKET
        });
        console.log("archive upload: ", archiveKey);
      } else {
        console.log(err);
      }
      let compressedFiles = [];
      compressedFiles.push(logPath);
      let chromeLogs = headless.logPaths();
      for (let logIndex in chromeLogs) {
        compressedFiles.push(chromeLogs[logIndex]);
      }
      uploader.compressAndUploadMany(taskId, compressedFiles)
      .then((result) => {
        console.log("log upload results: ", result);
        kennel.tryPostback(taskId, {
          logs_key: result[0],
          logs_bucket: process.env.S3_BUCKET
        });
        kennel.tryPostback(taskId, {status: 'complete', progress: 100});
        setTimeout(() => {
          // don't judge me.
          process.exit(0);
        }, 1000);
      })
      .catch((err) => {
        console.log('compress and upload failure', err);
        console.log(err);
      });      
    });
  }
}

process.on('SIGINT', () => {
  interruptCount++
  onInterrupt();
  setInterval(() => {
    console.log('still waiting...');
    onInterrupt();
  }, 1000);
});

try {
  main();
  setTimeout(() => {
    // For now, archives just run for 5 minutes. TODO: webhook eyyyy
    onInterrupt();
  }, 300000);
} catch (e) {
  console.log(e);
}
