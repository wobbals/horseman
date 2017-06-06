
let subscribers = [];
let Runtime;
let remoteInterval;
const remoteContainer = "otRemoteRecordingStreams";
let remoteContainerId;
let recorderIds = {};

let reval = async function(script) {
  //console.log("Remote evaluate script ", script);
  let result = await Runtime.evaluate({
    expression: script
  });
  if (result.exceptionDetails) {
    console.log("Remote evaluate script ", script);
    console.log('result:', result);
  }
  return result;
}

let sidFor = function(subscriberId) {
  return subscriberId.replace(new RegExp('-', 'g'), '_');
}

let createRecorder = async function(subscriberId) {
  try {
    let sid = sidFor(subscriberId);
    let r = await reval(
      `var ms_${sid}=OT.subscribers.get("${subscriberId}")._.webRtcStream();` +
      `var recorder_${sid} = new MediaRecorder(ms_${sid},`+
      ` {mimeType: 'audio/webm'}`+
      `);` +
      `recorder_${sid}.ondataavailable = e => { `+
      ` sendBlobToSink(e.data, '${subscriberId}', e.timecode); `+
      //` console.log('sending blob to sink size='+e.data.size);`+
      `};` +
      `recorder_${sid}.start();` +
      `recorder_${sid};`
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
      `xhr.open('POST', 'http://localhost:3001/blobSink/'+sid);`+
      `xhr.setRequestHeader('X-BLOB-TS', ts);`+
      `xhr.send(blob);`+
      ``+
      `}`
    );

    remoteInterval = setInterval(checkPeriodic, 1000);

  } catch (e) {
    console.log("initializeRemoteRecording: ", e);
  }
}

module.exports.initializeRemoteRecording = initializeRemoteRecording;
