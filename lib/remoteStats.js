var statsLoop = function() {
  try {
    if (window.OT === undefined) {
      console.log("Injection: No OpenTok controller.");
      return;
    }

    OT.subscribers.forEach((s) => {
      s.getStats((err, stats) => {
        if (err) {
          console.log(`Injection: getStats: ${err}`);
          return;
        }
        let log = `Injection: Subscriber ${s.widgetId}`;
        log += ` streamId=${s.streamId}`;
        log += ` hasVideo=${s.stream.hasVideo}`;
        log += ` hasAudio=${s.stream.hasAudio}`;
        if (stats.video) {
          log += ` frameRate=${stats.video.frameRate}`;
        }
        console.log(log);
      });
    });

  } catch (e) {
    console.error("Injection: Exception:", e.message);
    console.log(e.stack);
  }
};

var statsInterval = setInterval(statsLoop, 5000);
console.log('Injection: Remote stats monitor loaded!');
