const zlib = require('zlib');
const libPath = require('path');
const fs = require('fs');
const s3 = require('s3');
const tar = require('tar');
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

let taskId = undefined;

let uploadTasks = [];

let archiveAndAddFiles = function(paths) {
  let archivePath = `${process.cwd()}/${taskId}.tar`;
  debug(`archiveAndAddFiles: archive=${archivePath} `+
    ` paths=${JSON.stringify(paths)}`);
  // tar -C not behaving as expected...why?
  let relativePaths = [];
  for (let i in paths) {
    relativePaths.push(paths[i].replace(process.cwd(), '.'));
  }
  debug(`archiveAndAddFiles: relativePaths=${JSON.stringify(relativePaths)}`);
  // WTF: this function returns a promise if sync is not set in options,
  // but a promise chain will not resolve to the s3 upload key :-(
  tar.c({
    file: archivePath,
    C: process.cwd(),
    sync: true
  }, relativePaths);
  let p = upload(archivePath);
  uploadTasks.push(p);
  return p;
}

let compressAndAddFile = function(path) {
  debug(`compressAndAddFile: path=${path}`);
  let p = compressFile(path).then(upload);
  uploadTasks.push(p);
  return p;
}

let addFile = function(path) {
  debug(`addFile: path=${path}`);
  let p = upload(path);
  uploadTasks.push(p);
  return p;
}

let finalize = function() {
  debug(`finalize: uploadTasks.length=${uploadTasks.length}`);
  return Promise.all(uploadTasks);
}

let compressFile = function(path) {
  debug(`compressFile: path=${path}`);
  return new Promise((resolve, reject) => {
    let fstat;
    try {
      fstat = fs.lstatSync(path);
    } catch (e) {
      return reject(`compressFile: cannot stat ${path}`);
    }
    if (!fstat.isFile()) {
      return reject(`compressFile: file ${path} does not exist`);
    }
    let gzip = zlib.createGzip();
    let inp = fs.createReadStream(path);
    let compressedLogsPath = `${path}.gz`
    let out = fs.createWriteStream(compressedLogsPath);
    inp.pipe(gzip).pipe(out);
    out.on("finish", function() {
      try {
        fs.unlinkSync(path);
      } catch (e) {
        debug(`compressFile: (nonfatal) cannot delete compressable ${path} (err=${e})`);
      }
      resolve(compressedLogsPath);
    });
  });
}

let upload = function(path) {
  debug(`upload: path=${path}`);
  return new Promise((resolve, reject) => {
    if (!process.env.S3_PREFIX || !process.env.S3_BUCKET) {
      debug(`upload: missing S3 configuration vars. Skipping ${path}`);
      return reject('missing S3 configuration');
    }

    let key =
    `${process.env.S3_PREFIX}/${taskId}/${libPath.basename(path)}`;
    debug(`Begin upload to ${key} at ${process.env.S3_BUCKET}`);
    let params = {
      localFile: path,
      s3Params: {
        Bucket: process.env.S3_BUCKET,
        Key: key,
        ACL: 'private'
      }
    };
    let uploadFile = uploader.uploadFile(params);
    uploadFile.on('error', function(err) {
      debug("unable to upload:", err.stack);
      return reject(err);
    });

    uploadFile.on('progress', function() {
      //debug(`upload: progressing ${path}`);
      // try {
      //
      //   let progress = uploadFile.progressAmount / upload.progressTotal;
      //   debug(`upload: path=${path} progress=${progress.toFixed(2)}`);
      // } catch (e) { /* nop */ }
      // TODO: This is another spot where progress updates could get rewired
      // back to the job callback endpoint
    });
    uploadFile.on('end', function() {
      debug(`upload complete: ${path} key=${key}`);
      if (process.env.CLEAN_ARTIFACTS) {
        try {
          // clean up!
          fs.unlinkSync(path);
        } catch (e) {
          debug(`upload: unable to cleanup after ${path}`);
        }
      }
      resolve(key);
    });
  }).catch((err) => {
    // don't let a failed upload block the whole promise chain. just report and
    // continue.
    debug(`upload of ${path} failed with error`, err);
  });
}

module.exports = function(args) {
  taskId = args.taskId;
  return {
    archiveAndAddFiles,
    compressAndAddFile,
    addFile,
    finalize
  };
}