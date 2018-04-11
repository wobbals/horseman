const child_process = require('child_process');
const ChromeLauncher = require('chrome-launcher');
const ChromeRemoteInterface = require('chrome-remote-interface');
const injection = require('./injection');
const debug = require('debug')('horseman:headless');
const config = require('config');
const networkDebug = require('debug')('horseman:headless:network');
const consoleDebug = require('debug')('horseman:headless:console');
const EventEmitter = require('events');

let eventHandlers = new EventEmitter();
let launcher;
let Chrome;
let HeadlessExperimental;
let Page;
let Network;
let Security;
let Log;
let Runtime;
let windowWidth;
let windowHeight;

let pageForceTimer;
let pageForceEvent;
let lastFreshFrameTime = new Date();

let rootURL;
let rootRequestId = null;
let rootRefreshAttempted = false;
let launchDate;
let beginFrameTimer;

const userDataPath = `${process.cwd()}/CHROME`;
let logPathsArr = [];
// logPathsArr.push(`${userDataPath}/chrome-err.log`);
// logPathsArr.push(`${userDataPath}/chrome-out.log`);

const logPaths = function() {
  return logPathsArr;
}

const startChrome = function() {
  child_process.execSync(`mkdir -p ${userDataPath}`);
  let chromeVersion = "unknown";
  // TODO: chrome-finder is already implemented in ChrmomeLauncher. dig it out.
  // This will not work on OSX unless path is set manually.
  let chromePath = process.env.CHROME_PATH || 'google-chrome-stable'
  try {
    chromeVersion =
    child_process.execSync(`${chromePath} --version | awk ' { for (i=1; i<=NF; ++i) { if ($i ~ /^[0-9]/) print $i } } '`)
    .toString().trim();
    chromePath = child_process.execSync(`which ${chromePath}`).toString().trim();
  } catch (error) {
  }
  debug(`chrome path: ${chromePath}`);
  debug(`chrome version: ${chromeVersion}`);
  let chromeFlags = [
    `--window-size=${windowWidth},${windowHeight}`,
    '--disable-gpu',
    '--hide-scrollbars',
    `--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36 (TBRAD)`,
    '--remote-debugging-address=0.0.0.0',
    '--no-sandbox', // needed for Docker :-(
    '--no-zygote', // needed for Docker :-(
    '--headless',
    '--autoplay-policy=no-user-gesture-required'
  ];
  if (process.env.BF_SCREENCAST) {
    chromeFlags.push('--run-all-compositor-stages-before-draw');
  }
  if (process.env.TRACE_CHROME) {
    chromeFlags.push('--trace-startup');
  }
  debug(`launching Chrome with flags ${chromeFlags}`);
  let launchOpts = {
    port: 9222,
    chromeFlags: chromeFlags,
    handleSIGINT: false,
    logLevel: 'verbose',
    userDataDir: userDataPath
  };
  if (!process.env.CHROME_PATH) {
    launchOpts.chromePath = chromePath;
  }
  return ChromeLauncher.launch(launchOpts);
}

function onConsole(e) {
  let msg = e.type.toUpperCase() + ': ';
  for (argIndex in e.args) {
    let arg = e.args[argIndex];
    if (arg.type === 'string') {
      msg += `${arg.value} `;
    } else {
      msg += arg;
    }
  }
  consoleDebug(msg);
}

function onExceptionThrown(e) {
  let msg = `Remote Exception: `;
  if (e.exceptionDetails.exception) {
    let exception = e.exceptionDetails.exception;
    msg += `${exception.description}`;
  } else {
    msg += ` ${e.exceptionDetails.text}`;
  }
  if (e.exceptionDetails.url) {
    msg += ` at <${e.exceptionDetails.url}>`;
  }
  msg += `:${e.exceptionDetails.lineNumber}`;

  consoleDebug(msg);
}

function onPageScreencast(e) {
  // debug('onScreencast');
  // There's a wee race when tearing down: don't sent ack to a dead chrome.
  if (Page) {
    Page.screencastFrameAck({sessionId: e.sessionId})
    .catch((err) => {
      debug(`ScreencastAck err: `, err);
    });
  }
  let now = new Date();

  // replay this frame in 1s if we don't receive a new one sooner
  if (pageForceEvent &&
    e.metadata.timestamp == pageForceEvent.metadata.timestamp) {
    let oldTs = e.metadata.timestamp;
    e.metadata.timestamp = new Date().getTime() / 1000.0;
    debug(`repeating ts ${oldTs}; new ts ${e.metadata.timestamp}`+
      ` staleTime=${((now - lastFreshFrameTime) / 1000).toFixed()}s`);
    pageForceTimer = null;
  } else {
    // this is a fresh frame
    lastFreshFrameTime = now;
  }
  if (now - lastFreshFrameTime > config.get('media_inactivity_timeout')) {
    debug(`Inactivity timeout: No media is flowing from Chrome`);
    if (!eventHandlers.emit('error', 'inactivityTimeout')) {
      debug(`No listener for media inactivity. sending interrupt.`);
      process.kill(process.pid, 'SIGINT');
    }
    // TODO: This is too crass.
    // Refactor this module to an EventEmitter and pass this event back to
    // parent.
  }
  if (pageForceTimer) {
    clearTimeout(pageForceTimer);
  }
  pageForceEvent = e;
  pageForceTimer = setTimeout(() => {
    onPageScreencast(pageForceEvent);
  }, 1000);

  eventHandlers.emit('screencastFrame', e);
}

function onException(e) {
  // I haven't seen this yet, so it hasn't been formatted properly
  debug("Runtime.exceptionThrown:", e);
}

function onNetworkRequestBegin(e) {
  networkDebug(`${e.requestId}: ${e.request.method} ${e.request.url}`);
  if (e.request.url === rootURL && null === rootRequestId) {
    networkDebug(`set root request id ${e.requestId}`);
    rootRequestId = e.requestId;
  }
}

function onNetworkRequestResponse(e) {
  networkDebug(`${e.requestId}: ${e.response.status} ${e.response.statusText}`);
}

function onNetworkLoadingFailed(e) {
  networkDebug(`${e.requestId}: ${e.errorText}`)
  if (!rootRefreshAttempted &&
    (e.requestId === rootRequestId || (new Date() - launchDate) < 10000)) {
    rootRefreshAttempted = true;
    networkDebug("detected root or early page load failure. retrying once.");
    setTimeout(() => {
      networkDebug('reload root url');
      Page.reload({ignoreCache: true})
      .then(() => { networkDebug('reload requested')})
      .catch((err) => { networkDebug(`reload failed: ${err.message}`)});
    }, 5000);
  }
}

function onNetworkCacheHit(e) {
  networkDebug(`${e.requestId}: Cache Hit`)
}

function onNetworkWebSocketCreated(e) {
  networkDebug(`${e.requestId}: WebSocket created at ${e.url}`);
}

function onNetworkWebSocketDestroyed(e) {
  networkDebug(`${e.requestId}: WebSocket destroyed`);
}

function onBFC(e) {
  debug("onBeginFramesChanged", e);
  let fps = 30;
  if (process.env.BF_FPS) {
    fps = parseInt(process.env.BF_FPS);
  }
  debug(`beginFrame frames per second=${fps}`);
  if (e.needsBeginFrames) {
    beginFrameTimer = setInterval(sendBeginFrame, 1000/fps);
  } else if (beginFrameTimer) {
    clearInterval(beginFrameTimer);
  }
}

function onBFScreenshotsReady(e) {
  debug("onBFScreenshotsReady", e);
}

function onTargetAttached(e) {
  debug("onTargetAttached", e);
}

function onTargetCreated(e) {
  debug("onTargetCreated", e);
}

function onTargetDetached(e) {
  debug('onTargetDetached', e);
}

function onTargetMessage(e) {
  debug('onTargetMessage', e);
}

const setupRemoteHooks = async function(remoteChrome) {
  Page = remoteChrome.Page;
  Runtime = remoteChrome.Runtime;
  Log = remoteChrome.Log;
  Security = remoteChrome.Security;
  Network = remoteChrome.Network;
  HeadlessExperimental = remoteChrome.HeadlessExperimental;
  Target = remoteChrome.Target;

  await Promise.all([
    Network.enable(),
    Page.enable(),
    Security.enable(),
    Log.enable(),
    Runtime.enable()
  ]);

  // bypass SSL security errors
  await Security.setOverrideCertificateErrors({override: true});
  remoteChrome.on("Security.certificateError", (e) => {
    debug("onSecurityCertificateError", e);
    Security.handleCertificateError({
      eventId: e.eventId,
      action: 'continue'
    })
  });

  remoteChrome.on("Runtime.exceptionThrown", onExceptionThrown);
  remoteChrome.on("Runtime.consoleAPICalled", onConsole);
  remoteChrome.on("Page.screencastFrame", onPageScreencast);
  remoteChrome.on("Network.requestWillBeSent", onNetworkRequestBegin);
  remoteChrome.on("Network.responseReceived", onNetworkRequestResponse);
  remoteChrome.on("Network.loadingFailed", onNetworkLoadingFailed);
  remoteChrome.on("Network.requestServedFromCache", onNetworkCacheHit);
  remoteChrome.on("Network.webSocketCreated", onNetworkWebSocketCreated);
  remoteChrome.on("Network.webSocketClosed", onNetworkWebSocketDestroyed);
  remoteChrome.on("HeadlessExperimental.needsBeginFramesChanged", onBFC);
  remoteChrome.on("HeadlessExperimental.mainFrameReadyForScreenshots", onBFScreenshotsReady);
}

const sendBeginFrame = async function() {
  try {
    let frameTime  = new Date().getTime();
    let bf = await HeadlessExperimental.beginFrame({
      screenshot: {
        format: "jpeg",
        quality: 100
      }
    });
    //debug(`bf: ${frameTime} hasDamage: ${bf.hasDamage} mainContentUpdated: ${bf.mainFrameContentUpdated}`);
    if (bf.mainFrameContentUpdated && bf.screenshotData) {
      eventHandlers.emit('screencastFrame', {
        data: bf.screenshotData,
        metadata: {
          timestamp: frameTime / 1000.0
        }
      });
    }
  } catch (e) {
    debug("error: BFScreencast: ", e.message);
  }
}

const initScreencastPage = async function(url) {
  await Page.startScreencast({
    format: "jpeg",
    quality: 100
  });
  debug("screencast started (using Page.startScreencast)");
}

const createBFChromeTarget = async function(url) {
  // events bind to the parent (original) target, not the one we create.
  Chrome.on("Target.attachedToTarget", onTargetAttached);
  Chrome.on("Target.targetCreated", onTargetCreated);
  Chrome.on("Target.detachedFromTarget", onTargetDetached);
  Chrome.on('Target.receivedMessageFromTarget', onTargetMessage);

  let browserContext = await Target.createBrowserContext();
  let target = await Target.createTarget({
    url: url,
    width: windowWidth,
    height: windowHeight,
    browserContext: browserContext.browserContextId,
    enableBeginFrameControl: true
  });
  debug("BF: created target with id", target.targetId);
  let session = await Target.attachToTarget({
    targetId: target.targetId
  });
  debug("BF: attached to target with session id", session.sessionId);
  await Target.activateTarget({
    targetId: target.targetId
  });
  debug(`BF: target ${target.targetId} is active (focused)`);

  return await ChromeRemoteInterface({
    target: target.targetId
  });
}

const launch = async function(url, width, height) {
  windowWidth = width;
  windowHeight = height;
  rootURL = url;
  launchDate = new Date();
  try {
    launcher = await startChrome();
    Chrome = await ChromeRemoteInterface();
    if (process.env.BF_SCREENCAST) {
      debug("launch: enable BeginFrame chrome target");
      Target = Chrome.Target;
      Chrome = await createBFChromeTarget(url);
    }
    await setupRemoteHooks(Chrome);
    debug(`launch: navigate to url ${url}`);
    await Page.navigate({url: url});
    await Page.loadEventFired();
    debug(`launch: page loaded`);
    if (process.env.BF_SCREENCAST) {
      await HeadlessExperimental.enable();
      debug(`launch: BF: HeadlessExperimental enabled`);
    } else {
      await initScreencastPage(url);
    }
    if (process.env.INDIVIDUAL_STREAM_RECORD) {
      await injection.initializeRemoteRecording(Runtime);
      debug('launch: remote recording enabled');
    }
    await injection.initializeRemoteStats(Runtime);
    debug('launch: remote stats monitoring enabled');
  } catch (e) {
    debug('launch: failed to launch chrome', e);
    return;
  }
}

const kill = async function() {
  try {
    if (pageForceTimer) {
      clearTimeout(pageForceTimer);
    }
    pageForceEvent = null;
    if (Chrome) {
      Page = null;
      await Chrome.close();
    }
    if (launcher) {
      await launcher.kill();
    }
    await injection.destroy();
  } catch (e) {
    debug(`kill: `, e);
  }
}

const on = function(event, handler) {
  eventHandlers.on(event, handler);
}

module.exports = {
  launch,
  kill,
  logPaths,
  on
}
