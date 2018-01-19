let subscribers = [];
let Runtime;
let remoteInterval;
const remoteContainer = "otRemoteRecordingStreams";
let remoteContainerId;
let recorderIds = {};
const revalDebug = require('debug')('horseman:headless:injection:reval');
const debug = require('debug')('horseman:headless:injection');

let reval = async function(script) {
  if (process.env.REVAL_VERBOSE) {
    revalDebug("Remote evaluate script ", script);
  }
  let result = await Runtime.evaluate({
    expression: script
  });
  if (result.exceptionDetails) {
    revalDebug("Exception: ", result);
    process.exit(-1);
  } else if (process.env.REVAL_VERBOSE) {
    revalDebug('result:', result);
  }
  return result;
}

let sidFor = function(subscriberId) {
  return subscriberId.replace(new RegExp('-', 'g'), '_');
}

let createRecorder = async function(subscriberId) {
  try {
    let sid = sidFor(subscriberId);
    let remoteSubscriberId = `remoteSubscriber_${sid}`;
    let msid = `ms_${sid}`;
    let rid = `recorder_${sid}`;
    let r = await reval(
      `var ${remoteSubscriberId}=OT.subscribers.get("${subscriberId}")._; ${remoteSubscriberId}`
    );
    r = await reval(
      `var ${msid} = ${remoteSubscriberId}.webRtcStream(); ${msid}`
    );
    if (r.result.type === 'undefined') {
      debug(`Error: no webrtc stream for subscriber ${subscriberId}`);
      // TODO: Remove this. We can just abort recording or something
      process.exit(1);
    }
    r = await reval(
      `var ${rid}=new MediaRecorder(${msid},`+
      ` {mimeType: 'video/webm'}`+
      `); ${rid}`
    );
    r = await reval(
      `${rid}.ondataavailable = e => { `+
      ` sendBlobToSink(e.data, '${subscriberId}', e.timecode); `+
      ` console.log('${subscriberId}: sending blob size='+e.data.size);`+
      ` console.log(JSON.stringify(e));`+
      `};` +
      `${rid}.start();` +
      //`recorder_${sid}.onstart = e => { recorder_${sid}.requestData(); };`+
      `${rid};`
    );
    console.log('createRecorder: ', r);
    recorderIds[subscriberId] = r.result.objectId;
  } catch (e) {
    console.log("createRecorder: ", e);
  }
}

let destroyRecorder = async function(subscriberId) {

}

let requestRecorderData = async function() {
  for (let index in recorderIds) {
    let sid = sidFor(index)
    console.log('get data for ', index, recorderIds[index]);
    let r = await reval(
      `recorder_${sid}.requestData();`
    );
  }
}

let saveRemoteContainer = async function() {
  let r = await Runtime.getProperties({
    objectId: remoteContainerId,
    ownProperties: true
  });
  //console.log('local subscribers: ', subscribers);
  //console.log("remote container: ", r);
  let remoteValues = [];
  r.result.forEach(async value => {
    if ('__proto__' === value.name) {
      return;
    }
    remoteValues.push(value.name);
    if (subscribers.indexOf(value.name) > -1) {
      // nothing to do
    } else {
      subscribers.push(value.name);
      console.log('setup recorder for ' + value.name);
      await createRecorder(value.name);
    }
  });
  subscribers.forEach((sid, localIndex) => {
    let remoteIndex = remoteValues.indexOf(sid);
    if (remoteIndex < 0) {
      console.log("remove recorder for " + sid);
      subscribers.splice(localIndex, 1);
    }
  });
}

let checkPeriodic = async function() {
  try {
    let result = await reval(`for (k in ${remoteContainer}) { delete ${remoteContainer}[k]};` +
      "OT.subscribers.forEach(s => {" +
    `if (!(s.widgetId in ${remoteContainer})) { ` +
    `${remoteContainer}[s.widgetId] = {}}` +
    "})");
    await saveRemoteContainer();
    await requestRecorderData();
  } catch (e) {
    console.log("checkPeriodic: ", e);
  }
}

let initializeRemoteRecording = async function(R) {
  try {
    Runtime = R;
    // do we need to do anything with this?
    let result = await reval(`var ${remoteContainer} = {}; ${remoteContainer}`);
    remoteContainerId = result.result.objectId;
    console.log("remote container id: " + remoteContainerId);

    result = await reval(
      `var sendBlobToSink = function(blob, sid, ts) { `+
      `let xhr = new XMLHttpRequest();`+
      `xhr.open('POST', 'https://localhost:3001/blobSink/'+sid);`+
      //`xhr.setRequestHeader("Content-type", "video/webm");`+
      `xhr.setRequestHeader('X-BLOB-TS', ts);`+
      `xhr.send(blob);`+
      ``+
      `}`
    );

    remoteInterval = setInterval(checkPeriodic, 1000);
    // remoteInterval = setTimeout(checkPeriodic, 1000);

  } catch (e) {
    console.log("initializeRemoteRecording: ", e);
  }
}

let destroy = function() {
  if (remoteInterval) {
    clearInterval(remoteInterval);
    remoteInterval = false;
  }
}

module.exports = {
  initializeRemoteRecording,
  destroy
}