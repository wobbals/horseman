const fs = require('fs');
const child_process = require('child_process');
const express = require('express');
const app = express();
var cors = require('cors');
app.use(cors());
const zmq = require('zeromq');
const sinkQueue = zmq.socket('push');
sinkQueue.bindSync('ipc:///tmp/ichabod-blobsink');
const https = require('https');
const pem = require('pem');

const bodyParser = require('body-parser');
app.use(bodyParser.raw({type: ['*/*', 'video/webm', 'audio/webm'], limit: '50mb'}));

app.post('/blobSink/:id', function (req, res) {
  res.send(`OK`);
  console.log(`received sink ${req.params.id}`);
  console.log(req.get("Content-Type"));
  console.log(req.body);
  let ts = req.get('X-BLOB-TS');
  console.log(ts);
  let uploadDir = `${process.cwd()}/uploads`;
  child_process.execSync(`mkdir -p ${uploadDir}`);
  let path = `${uploadDir}/${req.params.id}.webm`;
  console.log(path);
  fs.appendFileSync(path, req.body);
  sinkQueue.send([path, ts, req.params.id]);
});

pem.createCertificate({days:1, selfSigned:true}, function(err, keys) {
  if (err) {
    console.log(err);
  }
  https.createServer({
    key: keys.serviceKey,
    cert: keys.certificate
  }, app).listen(3001, function () {
    console.log('Blob sink listening on port 3001');
  });
});

module.exports.cleanup = function() {
  //unlink known webms written to the sink
}
