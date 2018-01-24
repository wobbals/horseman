
var statsLoop = function() {
  try {
    if (window.OT === undefined) {
      console.log("Injection: No OpenTok controller.");
      return;
    }

    OT.subscribers.forEach((s) => {
      s.getStats((err, stats) => {
        console.log(`Injection: Subscriber ${s.widgetId} frameRate = ${stats.video.frameRate}`);
      });
    });

  } catch (e) {
    console.error("Injection: Exception:", e.message);
    console.log(e.stack);
  }
};

var statsInterval = setInterval(statsLoop, 5000);
console.log('Injection: Remote stats monitor loaded!');
