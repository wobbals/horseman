const fs = require('fs');
const express = require('express');
const app = express();
var cors = require('cors');
app.use(cors());
const zmq = require('zeromq');
const sinkQueue = zmq.socket('push');
sinkQueue.bindSync('ipc:///tmp/ichabod-blobsink');

const bodyParser = require('body-parser');
const multer = require('multer'); // v1.0.5
const upload = multer({dest: 'uploads/'}); // for parsing multipart/form-data

app.use(bodyParser.json());
app.use(bodyParser.raw({type: 'audio/webm',limit: '50mb'}));
// for parsing application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/blobSink/:id', function (req, res) {
  res.send(`OK`);
  console.log(`received sink ${req.params.id}`);
  console.log(req.get("Content-Type"));
  console.log(req.body.length);
  let ts = req.get('X-BLOB-TS');
  console.log(ts);
  let path = `${process.cwd()}/uploads/${req.params.id}-${ts}.webm`;
  console.log(path);
  fs.writeFileSync(path, req.body);
  sinkQueue.send([path, req.params.id, ts]);
});

app.listen(3001, function () {
  console.log('Blob sink listening on port 3001');
});
