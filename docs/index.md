# Archive live sessions

Dive right in:

```js

var request = require('request');

var body = {
  width: 640,
  height: 480,
  url: "https://wobbals.github.io/horseman/viewer.html"
};
var myJobId;

request.post({
  url: `${barcURL}/job`,
  json: body
}, (error, response, body) => {
  if (error) {
    console.log(error);
  } else {
    myJobId = body.jobId;
  }
});

```


```sh

curl -v -H "Content-Type: application/json" \
-d "{\"width\": \"720\", \
 \"height\": \"720\", \
 \"url\": \"https://wobbals.github.io/horseman/viewer.html\" \
 }"  https://kennel.wobbals.com/horseman/job

```

# Broadcast live sessions

Same as with archiving, you can set the `broadcastURL` parameter to any RTMP
URL to get your RTMP broadcast running based on any URL you wish. For example:

```sh

(
SESSION_ID=""
API_KEY=""
TOKEN=""
RTMP_URL="rtmp://live.twitch.tv/app/myStreamKey"
WIDTH=1280
HEIGHT=720
curl -v -H "Content-Type: application/json" -d "{\"width\": \"${WIDTH}\", \
 \"height\": \"${HEIGHT}\", \
 \"url\": \"https://wobbals.github.io/horseman/viewer.html?sessionId=${SESSION_ID}&apiKey=${API_KEY}&token=${TOKEN}\", \
 \"broadcastURL\": \"${RTMP_URL}\" \
}"  https://kennel.wobbals.com/horseman/job
)

```

## Viewer.html

The viewer page mentioned in the examples above is a quickstart that uses
[opentok-layout-js](https://github.com/aullman/opentok-layout-js) and can
connect to any session that you can pass a valid token to.

Use GET parameters to get started, then move on to define your own layouts:

* `sessionId` - the session ID to join
* `token` - the token for this session ID
* `apiKey` - the project ID for this session
* `env` - set to `tbdev` if using meet.tokbox.com
