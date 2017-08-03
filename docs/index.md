# Archive live sessions

Dive right in:

```js

var request = require('request');

var body = {
  width: 640,
  height: 480,
  url: "https://wobbals.github.io/horseman/viewer.html",
  callbackURL: "https://asdf1234.ngrok.io"
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
 \"height\": \"640\", \
 \"url\": \"https://wobbals.github.io/horseman/viewer.html\", \
 \"callbackURL\":\"https://asdf1234.ngrok.io\"\ \
 }"  https://kennel.wobbals.com/horseman/job

```

This request will land in a queue, waiting to be assigned to a cluster node.
For the demo server, there are no warm servers kept in the cluster. If your
job requires a cold node to be added to the cluster, the wait time until
recording starts is expected to be 180 seconds. You can monitor when recording
begins with the callbackURL.

## Check job status

**Note**: The best way to get updates is via the callbackURL parameter. Prefer
callbacks over status polling for great success.

The return body of the previous request will have some information you need to
use for future requests:

```sh
{
    "accessToken": "asdf1234",
    "jobId": "9584d206-c509-415e-9a6f-20e17adf4425"
}

```

If you didn't use a callback in the previous request, use these credentials to
form a status request:
```sh
curl -s https://kennel.wobbals.com/job/JOB_ID_HERE?token=ACCESS_TOKEN_HERE
{
    "status": "queued"
}

```

Eventually, a queued job will land on the cluster and begin recording:

```sh
curl -s https://kennel.wobbals.com/horseman/job/JOB_ID_HERE?token=TOKEN_HERE
{
    "createdAt": "Thu Aug 03 2017 20:16:06 GMT+0000 (UTC)",
    "status": "recording"
}
```

Some time later, the job will be complete and is ready for download:
```sh
curl -s https://kennel.wobbals.com/horseman/job/JOB_ID_HERE?token=TOKEN_HERE
{
    "createdAt": "Thu Aug 03 2017 20:16:06 GMT+0000 (UTC)",
    "progress": "100",
    "startedAt": "Thu Aug 03 2017 20:17:10 GMT+0000 (UTC)",
    "status": "complete",
    "stoppedAt": "Thu Aug 03 2017 20:22:16 GMT+0000 (UTC)"
}
```

## Download the results (Archive only)

After the job status is complete, you can download the archive:

```sh
curl -o result.mp4 -L "https://kennel.wobbals.com/horseman/job/JOB_ID_HERE?token=TOKEN_HERE&redirect=true"
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

**Note:** Broadcasts will not have a downloadable result.

## Viewer.html

The viewer page mentioned in the examples above is a quickstart that uses
[opentok-layout-js](https://github.com/aullman/opentok-layout-js) and can
connect to any session that you can pass a valid token to.

Use GET parameters to get started, then move on to define your own layouts:

* `sessionId` - the session ID to join
* `token` - the token for this session ID
* `apiKey` - the project ID for this session
* `env` - set to `tbdev` if using meet.tokbox.com
