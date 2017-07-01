const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const s3 = require('s3');
const request = require('request');
const progress = require('request-progress');
const debug = require('debug')('horseman:uploader');

const uploader = s3.createClient({
  maxAsyncS3: 20,     // this is the default
  s3RetryCount: 3,    // this is the default
  s3RetryDelay: 1000, // this is the default
  multipartUploadThreshold: 20971520, // this is the default (20 MB)
  multipartUploadSize: 15728640, // this is the default (15 MB)
  s3Options: {
    accessKeyId: process.env.S3_TOKEN,
    secretAccessKey: process.env.S3_SECRET,
    region: process.env.S3_REGION
  },
});

let compressAndUpload = function(taskId, filePath, cb) {
  let fstat;
  try {
    fstat = fs.lstatSync(filePath);
  } catch (e) {
    cb(null, `file ${filePath} does not exist`);
    return;
  }
  if (!fstat.isFile()) {
    cb(null, `file ${filePath} does not exist`);
    return;
  }
  var gzip = zlib.createGzip();
  const inp = fs.createReadStream(filePath);
  var compressedLogs = `${filePath}.gz`
  const out = fs.createWriteStream(compressedLogs);
  inp.pipe(gzip).pipe(out);
  out.on("finish", function() {
    upload(taskId, compressedLogs, cb);
  });
  try {
    fs.unlinkSync(filePath);
  } catch (e) {
    console.log(`cannot delete logs`);
  }
}

let upload = function(taskId, filePath, cb) {
  if (!process.env.S3_PREFIX || !process.env.S3_BUCKET) {
    debug("Missing S3 configuration vars");
    cb(null, 'missing S3 configuration');
    return;
  }
  let key =
  `${process.env.S3_PREFIX}/${taskId}/${path.basename(filePath)}`;
  debug(`Begin upload to ${key} at ${process.env.S3_BUCKET}`);
  var params = {
    localFile: filePath,
    s3Params: {
      Bucket: process.env.S3_BUCKET,
      Key: key,
      ACL: 'private'
    },
  };
  var uploadFile = uploader.uploadFile(params);
  uploadFile.on('error', function(err) {
    debug("unable to upload:", err.stack);
    cb(null, err);
  });
  uploadFile.on('progress', function() {
    // update job progress to keep from timing out
    // step 3: this phase should stay between 66% and 100%
    var normalizedComplete = upload.progressAmount + (2 * upload.progressTotal);
    var normalizedTotal = upload.progressTotal * 3;
    // TODO: This is another spot where progress updates need to get rewired
    // job.progress(normalizedComplete, normalizedTotal);
  });
  uploadFile.on('end', function() {
    debug("done uploading file");
    if (process.env.CLEAN_ARTIFACTS) {
      // clean up!
      fs.unlinkSync(filePath);
    }
    debug(`task ${taskId} completed successfully.`);
    cb(key, null);
  });
}

module.exports = {
  compressAndUpload,
  upload
}