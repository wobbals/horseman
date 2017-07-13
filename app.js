const path = require('path');
const fs = require('fs');
const ChromeLauncher = require('chrome-launcher');
const chrome = require('chrome-remote-interface');
const zmq = require('zeromq');
const validator = require('validator');
const uuid = require('uuid/v4')
const mediaQueue = zmq.socket('push');
mediaQueue.bindSync('ipc:///tmp/ichabod-screencast');

// const remoteRecording = require('./lib/remoteRecord');
// const blobSink = require('./lib/blobSink');
const ichabod = require('./lib/ichabod');
const pulse = require('./lib/pulseAudio');
const uploader = require('./lib/uploader');
const kennel = require('./lib/kennel');

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

/**
 * Launches a debugging instance of Chrome on port 9222.
 * @param {boolean=} headless True (default) to launch Chrome in headless mode.
 *     Set to false to launch Chrome normally.
 * @return {Promise<ChromeLauncher>}
 */
function launchChrome(headless=true) {
  return ChromeLauncher.launch({
    port: 9222,
    chromeFlags: [
      `--window-size=${argv.width},${argv.height}`,
      '--disable-gpu',
      '--no-sandbox', // needed for Docker :-(
      headless ? '--headless' : ''
    ],
    handleSIGINT: false
  });
}

let lastScreencastLogTime = new Date();
let frameCount = 0;
function sendScreencastFrame(data, timestamp) {
  frameCount++;
  try {
    mediaQueue.send([data, new Date(timestamp * 1000).getTime()]);
    let delta = (new Date() - lastScreencastLogTime) / 1000;
    if (delta > 2) {
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

async function doCapture(protocol) {
  const {Page, Runtime, Log, Security} = protocol;
  try {
    await Security.enable();
    await Security.setOverrideCertificateErrors({override: true});
    protocol.on("Security.certificateError", (e) => {
      console.log("onSecurity", e);
      Security.handleCertificateError({
        eventId: e.eventId,
        action: 'continue'
      })
    });

    await Page.enable();
    await Page.navigate({url: argv.url});

    console.log(`navigated to ${argv.url}`);
    await Page.loadEventFired();
    console.log("loadEventFired");
    ichabod.launch({
      output: outfileName,
      logPath: logPath
    });
    kennel.tryPostback(taskId, {status: 'recording'});
    await Runtime.enable();
    await Log.enable();
    protocol.on("Page.screencastFrame", async (event) => {
      //console.log("onScreencastFrame");
      sendScreencastFrame(event.data, event.metadata.timestamp);
      try {
        await Page.screencastFrameAck({sessionId: event.sessionId});
      } catch (e) {
        console.log("onScreencastFrame: ", e);
      }
    });
    protocol.on("Runtime.consoleAPICalled", onConsole);
    protocol.on("Runtime.exceptionThrown", onException);
    protocol.on("Log.entryAdded", onLogEntry);
    //await remoteRecording.initializeRemoteRecording(Runtime);
    await Page.startScreencast({
      format: "jpeg",
      quality: 100
    });
    console.log("startScreencast");
  } catch (e) {
    console.log(e);
  }
  // keep this open while interval is running
  //protocol.close();
};

var launcher;

async function main() {
  kennel.tryPostback(taskId, {status: 'initializing'});
  console.log('launching chrome...');
  try {
    launcher = await launchChrome();
    console.log('successfully launched chrome!', launcher);
  } catch (e) {
    console.log("chrome launch failure ", e);
    return;
  }

  chrome(async (protocol) => {
    try {
      await doCapture(protocol);
    } catch (e) {
      console.log('doCapture: ', e);
    }
    //launcher.kill();
  }).on('error', err => {
    throw Error('Cannot connect to Chrome:' + err);
    if (launcher) {
      launcher.kill();
    }
  });
}

let interruptCount = 0;
let uploadRequested = false;
let onInterrupt = () => {
  launcher.kill();
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
    //console.log('sending interrupt to ichabod');
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
      }
      console.log("archive upload: ", archiveKey);
      uploader.compressAndUpload(taskId, logPath, (logsKey, err) => {
        if (!err) {
          kennel.tryPostback(taskId, {
            logs_key: logsKey,
            logs_bucket: process.env.S3_BUCKET
          });
        }
        console.log("log upload: ", logsKey);
        console.log("Goodbye!");
        kennel.tryPostback(taskId, {status: 'complete', progress: 100});
        setTimeout(() => {
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
  main();
  setTimeout(() => {
    // For now, archives just run for 5 minutes. TODO: webhook eyyyy
    onInterrupt();
  }, 300000);
} catch (e) {
  console.log(e);
}
