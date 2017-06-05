const fs = require('fs');
const {ChromeLauncher} = require('lighthouse/lighthouse-cli/chrome-launcher');
const chrome = require('chrome-remote-interface');
const zmq = require('zeromq');
const mediaQueue = zmq.socket('push');
mediaQueue.bindSync('ipc:///tmp/ichabod');

const remoteRecording = require('./remoteRecord');

/**
 * Launches a debugging instance of Chrome on port 9222.
 * @param {boolean=} headless True (default) to launch Chrome in headless mode.
 *     Set to false to launch Chrome normally.
 * @return {Promise<ChromeLauncher>}
 */
function launchChrome(headless = true) {
  const launcher = new ChromeLauncher({
    port: 9222,
    autoSelectChrome: true, // False to manually select which Chrome install.
    additionalFlags: [
      '--window-size=1280,720',
      '--disable-gpu',
      headless ? '--headless' : ''
    ]
  });

  return launcher.run().then(() => launcher)
    .catch(err => {
      return launcher.kill().then(() => { // Kill Chrome if there's an error.
        throw err;
      }, console.error);
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

async function doCapture(protocol) {
  const {Page, Runtime, Log} = protocol;
  try {
    await Page.enable();
    await Page.navigate({url: 'http://localhost:3000/denver'});
    console.log("navigated to meet");
    await Page.loadEventFired();
    console.log("loadEventFired");
    await Runtime.enable();
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
    await remoteRecording.initializeRemoteRecording(Runtime);
    // await Page.startScreencast({
    //   format: "jpeg",
    //   quality: 100
    // });
    // console.log("startScreencast");
  } catch (e) {
    console.log(e);
  }
  // keep this open while interval is running
  //protocol.close();
};

var launcher;

async function main() {
  launcher = await launchChrome();

  chrome(async (protocol) => {
    await doCapture(protocol);
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

process.on('SIGINT', () => {
  launcher.kill();
  console.log('Goodbye!');
  process.exit(0);
});
