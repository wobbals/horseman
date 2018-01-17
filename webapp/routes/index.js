const express = require('express');
const router = express.Router();
const debug = require('debug')('horseman:ws');
const config = require('config');
const hash_generator = require('random-hash-generator');
const job_helper = require("../helpers/job_helper");
const kennel = require("../helpers/kennel");
const Job = require('../model/job');
const remoteControl = require('../helpers/remoteControl');

router.get('/', function(req, res, next) {
  res.render('index', { title: 'HORSEMAN' });
});

router.get('/job', function(req, res) {
  res.json({message: 'missing jobId'}).status(400);
});

router.post('/job', function(req, res) {
  let job_args = job_helper.parseJobArgs(req.body);
  if (job_args.error) {
    res.json(job_args);
    res.status(400);
    return;
  }
  let key_pair = hash_generator.generate(
    config.get("secret_token_length"),
    config.get("secret_token_length"),
    config.get("secret_token_salt")
  );
  let job_data = {};
  job_data.secret = key_pair.secret;
  if (job_args.externalCallbackURL) {
    job_data.externalCallbackURL = job_args.externalCallbackURL;
  }
  kennel.postTask(req.body, (error, response) => {
    if (error) {
      res.status(500).json({error: error});
    } else {
      job_data.status = 'queued';
      Job.persist(response.taskId, job_data);
      res.status(202);
      res.json({jobId: response.taskId, accessToken: key_pair.key});
    }
  });
});

router.post('/job/:id/stop', async function(req, res) {
  let tokenValidated = await Job.checkKey(req.params.id, req.query.token);
  if (!tokenValidated) {
    res.status(403).json({"error": "missing or invalid token"});
    return;
  }
  if (remoteControl.terminateJob(req.params.id)) {
    res.status(202).json({message: 'ok'});
  } else {
    res.status(409).json({
      error: `no connection to job ${req.params.id}`,
      message: `job is known, but no connection has been established. ` +
      `has this job been started yet? try again later if not.`
    });
  }
});

router.post('/job/:id/start', async function(req, res) {
  let tokenValidated = await Job.checkKey(req.params.id, req.query.token);
  if (!tokenValidated) {
    res.status(403).json({"error": "missing or invalid token"});
    return;
  }
  if (remoteControl.startJob(req.params.id)) {
    res.status(202).json({message: 'ok'});
  } else {
    res.status(409).json({
      error: `no remote connection to job ${req.params.id}`,
      message: `job is known, but no connection has been established. ` +
      `has this job entered standby yet? try again later if not.`
    });
  }
});

router.get('/job/:id', async function(req, res) {
  let tokenValidated = await Job.checkKey(req.params.id, req.query.token);
  if (!tokenValidated) {
    res.status(403).json({"error": "missing or invalid token"});
    return;
  }
  kennel.getTask(req.params.id, function(err, body) {
    if (err) {
      res.status(404).json({"error": `unknown job ${req.params.id}`});
      return;
    }
    res.json(body);
  });
});

router.get('/job/:id/download', async function(req, res) {
  var redirect = (req.query.redirect === "true");
  let job = null;
  try {
    job = await Job.getJob(req.params.id);
  } catch (e) {
    debug(e);
  }
  if (!job) {
    return res.status(404).json({"error": `unknown job ${req.params.id}`});
  }
  debug('download job', job);
  let tokenValidated = await Job.checkKey(req.params.id, req.query.token);
  if (!tokenValidated) {
    res.status(403).json({"error": "missing or invalid token"});
    return;
  }
  if (job.status !== "complete") {
    res.status(202).json({
      "message": `job status ${job.status}. try again later.`
    });
    return;
  }
  if (!job.archiveKey) {
    res.status(404).json({error: 'no archive associated with this job'});
    return;
  }
  if (job.archiveBucket !== config.get("s3_bucket")) {
    res.status(500).json({error: 'server has no access to archive bucket'});
    return;
  }
  let downloadURL = null;
  try {
    downloadURL = await job_helper.getJobDownloadURL(job.archiveKey);
  } catch (e) {
    debug(e);
  }
  if (!downloadURL) {
    res.status(500).json({error: 'failed to fetch download url'});
  } else if (redirect) {
    res.redirect(downloadURL);
  } else {
    res.status(200).json({"downloadURL": downloadURL});
  }
});

module.exports = router;
