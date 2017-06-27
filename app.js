const fs = require('fs');
const ChromeLauncher = require('chrome-launcher');
const chrome = require('chrome-remote-interface');
const zmq = require('zeromq');
const mediaQueue = zmq.socket('push');
mediaQueue.bindSync('ipc:///tmp/ichabod-screencast');

// const remoteRecording = require('./lib/remoteRecord');
// const blobSink = require('./lib/blobSink');
const ichabod = require('./lib/ichabod');
const validator = require('validator');

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

function sendScreencastFrame(data, timestamp) {
  try {
    mediaQueue.send([data, new Date(timestamp * 1000).getTime()]);
    console.log("sent screencast frame ", timestamp);
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
    // await Page.navigate({url: 'https://b5c87d81.ngrok.io/denver/readonly'});

    console.log("navigated to meet");
    await Page.loadEventFired();
    console.log("loadEventFired");
    ichabod.launch();
    await Runtime.enable();
    await Log.enable();
    protocol.on("Page.screencastFrame", async (event) => {
      console.log("onScreencastFrame");
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
  console.log('launching chrome...');
  launcher = await launchChrome();
  console.log('successfully launched chrome!', launcher);

  chrome(async (protocol) => {
    try {
      await doCapture(protocol);
    } catch (e) {
      console.log('doCapture: ', e);
    }
    //launcher.kill();
  }).on('error', err => {
    throw Error('Cannot connect to Chrome:' + err);
    launcher.kill();
  });
}

try {
  main();
} catch (e) {
  console.log(e);
}

let interruptCount = 0;
let onInterrupt = () => {
  launcher.kill();
  if (interruptCount > 3) {
    console.log(`received ${interruptCount} interrupt signals. exiting.`);
    process.exit(2);
  }
  if (ichabod.pid()) {
    //console.log('sending interrupt to ichabod');
    //ichabod.interrupt();
    console.log("waiting for ichabod to exit");
  } else {
    console.log("Goodbye!");
    process.exit(0);
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
