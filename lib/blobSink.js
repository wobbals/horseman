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
const debug = require('debug')('horseman:blobsink');

const bodyParser = require('body-parser');

const uploadDir = `${process.cwd()}/individual_streams`;
child_process.execSync(`mkdir -p ${uploadDir}`);
let taskId = undefined;
let manifest = {
  createdAt: new Date().getTime(),
  files: [],
  id: taskId
};
let knownFiles = {};

app.use(bodyParser.raw({type: ['video/webm', 'audio/webm'], limit: '50mb'}));

app.use('/remoteRecord.js', express.static(__dirname + '/remoteRecord.js'));
app.use('/remoteStats.js', express.static(__dirname + '/remoteStats.js'));

app.post('/blobSink/:id', function (req, res) {
  res.send(`OK`);
  debug(`received sink ${req.params.id}`);
  debug(req.get("Content-Type"));
  debug(req.body);
  let ts = req.get('X-BLOB-TS');
  debug(ts);
  let filename = `${req.params.id}.webm`;
  let path = `${uploadDir}/${filename}`;
  fs.appendFileSync(path, req.body);
  debug(`writing blob to ${path}`);
  if (!knownFiles[req.params.id]) {
    knownFiles[req.params.id] = true;
    manifest.files.push({
      createdAt: new Date().getTime(),
      filename: filename
    });
  }
  debug(`manifest: ${JSON.stringify(manifest)}`);
  debug(`knownFiles: ${JSON.stringify(knownFiles)}`);
  sinkQueue.send([path, ts, req.params.id]);
});

let server;

pem.createCertificate({days:1, selfSigned:true}, function(err, keys) {
  if (err) {
    console.log(err);
  }
  server = https.createServer({
    key: keys.serviceKey,
    cert: keys.certificate
  }, app).listen(3001, function () {
    debug('Blob sink listening on port 3001');
  });
});

let kill = function() {
  if (server) {
    server.close();
    server = null;
  }
  try {
    if (manifest.files.length > 0) {
      fs.writeFileSync(`${uploadDir}/manifest.json`,
        JSON.stringify(manifest, null, ' '));
    }
  } catch (e) {
    debug(`kill: failed to write manifest err=${e}`);
  }
}

let uploadPaths = function() {
  let result = [];
  try {
    let files = fs.readdirSync(uploadDir);
    for (let i in files) {
      result.push(`${uploadDir}/${files[i]}`);
    }
  } catch (err) { /* nop */ }
  return result;
}

module.exports = function(args) {
  taskId = args.taskId;
  return {
    kill,
    uploadPaths
  };
}
