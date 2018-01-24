var subscriberRecorders = {};

var sendBlobToSink = function(blob, sid, ts, contentType) {
  let xhr = new XMLHttpRequest();
  xhr.open('POST', 'https://localhost:3001/blobSink/'+sid);
  xhr.setRequestHeader('Content-type', contentType);
  xhr.setRequestHeader('X-BLOB-TS', ts);
  xhr.send(blob);
};

var injectSubscriberRecorder = function(subscriber) {
  let widgetId = subscriber.widgetId;
  if (!widgetId) {
    return;
  }
  let subscriberInternal = subscriber._;
  if (!subscriberInternal) {
    return;
  }
  let mediaStream = subscriberInternal.webRtcStream();
  if (!mediaStream) {
    return;
  }
  if (!mediaStream.active) {
    checkSubscriberHealth(subscriber);
    return;
  }
  if (!checkMediaStreamHealth(subscriber, mediaStream)) {
    return;
  }

  console.log(`Injection: Create recorder for ${widgetId}`);

  // TODO: mimetype should detect subscriber video codec and pass it through
  // to prevent an unnecessary transcode
  let mimeType = 'video/webm';
  let contentType = 'video/webm';

  let recorder = new MediaRecorder(mediaStream, {mimeType: mimeType});
  recorder.ondataavailable = (e) => {
    sendBlobToSink(e.data, widgetId, e.timecode, contentType);
    console.log(`Injection: ${widgetId}: sending blob size=${e.data.size}`);
  };
  recorder.start(1000);
  subscriberRecorders[widgetId] = {
    recorder: recorder,
    subscriber: subscriber
  };
};

var checkSubscriberHealth = function(subscriber) {
  let widgetId = subscriber.widgetId;
  if (!widgetId) {
    return;
  }
  let subscriberInternal = subscriber._;
  if (!subscriberInternal ||
    !('function' === typeof(subscriberInternal.webRtcStream))) {
    return;
  }
  let recorder = subscriberRecorders[widgetId].recorder;
  if (!recorder) {
    return;
  }
  let mediaStream = subscriberInternal.webRtcStream();
  if (!mediaStream.active || !checkMediaStreamHealth(subscriber, mediaStream)) {
    console.log("Injection: Remove recorder for subscriber " + widgetId)
    recorder.stop();
    delete subscriberRecorders[widgetId];
  }
};

var checkMediaStreamHealth = function(subscriber, mediaStream) {
  if (subscriber.stream.hasAudio) {
    let audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length < 1) {
      console.log(`Injection: Subscriber ${widgetId} missing audio track`);
      return false;
    }
    let audioTrack = audioTracks[0];
    if (!audioTrack.enabled) {
      console.log(`Injection: Audio track for ${widgetId} is not active`);
      return false;
    }
  }
  if (subscriber.stream.hasVideo) {
    let videoTracks = mediaStream.getVideoTracks();
    if (videoTracks.length < 1) {
      console.log(`Injection: Subscriber ${widgetId} missing video track`);
      return false;
    }
    let videoTrack = videoTracks[0];
    if (!videoTrack.enabled) {
      console.log(`Injection: Video track for ${widgetId} is not active`);
      return false;
    }
  }
  return true;
}

var injectionLoop = function() {
  try {
    if (window.OT === undefined) {
      console.log("Injection: No OpenTok controller.");
      return;
    }

    OT.subscribers.forEach((s) => {
      if (subscriberRecorders[s.widgetId] === undefined) {
        injectSubscriberRecorder(s);
      } else {
        checkSubscriberHealth(s);
      }
    });

    for (let widgetId in subscriberRecorders) {
      if (subscriberRecorders.hasOwnProperty(widgetId)) {
        checkSubscriberHealth(subscriberRecorders[widgetId].subscriber);
      }
    }
  } catch (e) {
    console.error("Injection: Exception:", e.message);
    console.log(e.stack);
  }
};

var horsemanInterval = setInterval(injectionLoop, 1000);
console.log('Injection: Remote recording loaded!');
