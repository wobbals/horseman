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
const jobControl = require('./lib/jobControl');
const blobSink = require('./lib/blobSink');
const loadmon = require('./lib/loadmon');

const debug = require('debug')('horseman:app');

const taskId = process.env.TASK_ID || uuid();
console.log(`Using taskId ${taskId}`);

let outfileName = `${process.cwd()}/${taskId}.mp4`;
let broadcastURL = process.env.BROADCAST_URL;

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

let startTime = new Date();
let lastScreencastLogTime = new Date();
let frameCount = 0;
let intervalAvg = 0;
let lastTimestamp = 0;
let sentEOS = false;
let started = false;
let interruptCount = 0;
let uploadRequested = false;

function updateFramerate(timestamp) {
  if (0 == lastTimestamp) {
    lastTimestamp = timestamp;
    return;
  }
  let interval = timestamp - lastTimestamp;
  intervalAvg = intervalAvg + (0.1 * (interval - intervalAvg));
  lastTimestamp = timestamp;
}

function bootlegAdjustTimestamp(timestamp) {
  return timestamp - intervalAvg;
}

function sendScreencastFrame(data, timestamp) {
  if (sentEOS) {
    return;
  }
  updateFramerate(timestamp);
  timestamp = bootlegAdjustTimestamp(timestamp);
  frameCount++;
  try {
    if (process.env.DEBUG_FRAMES && (new Date() - startTime) > 5000) {
      let buf = Buffer.from(data, 'base64');
      fs.writeFileSync(`${timestamp}.jpg`, buf);
    }
    mediaQueue.send([data, new Date(timestamp * 1000).getTime()]);
    let delta = (new Date() - lastScreencastLogTime) / 1000;
    if (delta > 5) {
      console.log(
        `sent ${frameCount} screencast frames in ${delta} seconds `+
        `(avg ${frameCount / delta} fps (ewma ${1/intervalAvg}))`
      );
      if (process.env.DEBUG_FRAMES && (new Date() - startTime) > 10000) {
        console.log("PEACE");
        onInterrupt();
      }
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
  started = true;
  kennel.tryPostback(taskId, {status: 'initializing'});
  try {
    headless.onScreencastFrame((event) => {
      sendScreencastFrame(event.data, event.metadata.timestamp);
    });
    ichabod.launch({
      output: outfileName,
      broadcast: broadcastURL,
      logPath: logPath
    });
    await headless.launch(argv.url, argv.width, argv.height);
    kennel.tryPostback(taskId, {status: 'recording'});
  } catch (e) {
    console.log('main: ', e);
  }
}

let onStart = function() {
  debug('remote start requested');
  if (started) {
    debug('ignoring remote start: this process has already started.');
  } else {
    main();
  }
};

let sendEOS = function() {
  if (!sentEOS) {
    console.log("send ichabod EOS");
    mediaQueue.send(["EOS"]);
    sentEOS = true;
    setTimeout(() => {
      console.log("EOS timer expired");
      ichabod.interrupt();
      onInterrupt();
    }, 300000);
  }
}

let onInterrupt = function() {
  headless.kill();
  blobSink.kill();
  if (!sentEOS) {
    sendEOS();
  }
  if (interruptCount > 1) {
    console.log(`received ${interruptCount} interrupt signals. exiting.`);
    kennel.tryPostback(taskId, {
      causedBy: "interrupted",
      status: 'error',
      error: 'interrupted'
    });
    process.exit(2);
  }
  if (ichabod.pid()) {
    // console.log(`sending interrupt to ichabod (pid=${ichabod.pid()})`);
    // ichabod.interrupt();
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
      })
      .catch((err) => {
        console.log('compress and upload failure', err);
        console.log(err);
      })
      .then(() => {
        setTimeout(() => {
          console.log('exiting normally');
          // don't judge me.
          process.exit(0);
        }, 1000);
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
  jobControl.onRemoteStop(onInterrupt);
  jobControl.onRemoteStart(onStart);
  if (process.env.REMOTE_CONTROL_URL) {
    // TODO: This is definitely a race condition with standby postback, for non
    // autostart jobs. probably will see it backfire in the form of HTTP 409
    // for calls to /job/:id/start -- YOU HEARD IT HERE FIRST CHARLES
    jobControl.connect(process.env.REMOTE_CONTROL_URL, taskId);
  }
  debug(`autostart is ${process.env.AUTOSTART}`);
  if (process.env.AUTOSTART === 'true' || process.env.AUTOSTART === undefined) {
    debug('schedule automatic start');
    // experiment: delay kicking off recording process for a few seconds.
    // hypothesis: newly created server is still having network hiccups.
    // if you remove this timeout and start to see more chrome refreshes on
    // pageload, then probably you should put it back.
    setTimeout(() => {
      main();
    }, 3000);
  } else {
    debug('entering standby');
    kennel.tryPostback(taskId, {status: 'standby'});
    // TODO: this should have a separate expiry from the job control max limit
  }
} catch (e) {
  console.log(e);
}
