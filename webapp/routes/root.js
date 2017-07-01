var express = require('express');
var router = express.Router();
var debug = require('debug')('horseman:ws');

router.get('/', function(req, res, next) {
  res.json({message: 'Horseman online'}).status(200);
});

module.exports = router;
