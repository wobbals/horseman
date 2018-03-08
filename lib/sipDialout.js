const debug = require('debug')('horseman:sip');
const sip = require('sip');
const transform = require('sdp-transform');
const os = require('os');
const EventEmitter = require('events');

let eventHandlers = new EventEmitter();
let callTags = {};
var dialogs = {};

function rstring() { return Math.floor(Math.random()*1e6).toString(); }

const start = function() {
  debug('start');
  //starting stack
  sip.start({
    logger: {
      send: function(message, address) { debug(`send: addr=address ${JSON.stringify(message)}`); },
      recv: function(message, address) { debug(`recv: addr=address ${JSON.stringify(message)}`); },
      error: function(e) { debug(e); }
    }
  }, function(rq) {
    debug(`onRequest: ${JSON.stringify(rq)}`);
    if (rq.headers.to.params.tag) { // check if it's an in dialog request
      var id = [rq.headers['call-id'], rq.headers.to.params.tag, rq.headers.from.params.tag].join(':');

      if(dialogs[id])
        dialogs[id](rq);
      else
        sip.send(sip.makeResponse(rq, 481, "Call doesn't exists"));
    }
    else
      sip.send(sip.makeResponse(rq, 405, 'Method not allowed'));
  });
}

let handleAnswer = function(answer) {
  let res = transform.parse(answer);
  debug(`handleAnswer: ${JSON.stringify(res)}}`);

  let rtpParams = {};

  for (let i in res.media) {
    let media = res.media[i];
    if ('video' === media.type) {
      rtpParams.videoSSRC = media.ssrcs[0].id;
      rtpParams.videoHost = media.connection.ip;
      rtpParams.videoPort = media.port;
      rtpParams.videoPT = media.payloads;
    } else if ('audio' === media.type) {
      rtpParams.audioSSRC = media.ssrcs[0].id;
      rtpParams.audioHost = media.connection.ip;
      rtpParams.audioPort = media.port;
      rtpParams.audioPT = media.payloads;
    }
  }

  debug(`handleAnswer: rtpParams=${JSON.stringify(rtpParams)}`);

  eventHandlers.emit('rtpOutputParams', rtpParams);
};

const invite = function(uri) {
  debug(`invite: uri=${uri}`);
  // Make the call
  sip.send({
    method: 'INVITE',
    uri: uri,
    headers: {
      to: {uri: uri},
      from: {uri: 'sip:test@test', params: {tag: rstring()}},
      'call-id': rstring(),
      cseq: {method: 'INVITE', seq: Math.floor(Math.random() * 1e5)},
      'content-type': 'application/sdp',
      contact: [{uri: 'sip:101@'+os.hostname()}]  // if your call doesnt get in-dialog request, maybe os.hostname() isn't resolving in your ip address
    },
    content:
      'v=0\r\n'+
      'o=- 13374 13374 IN IP4 127.0.0.1\r\n'+
      's=-\r\n'+
      'c=IN IP4 127.0.0.1\r\n'+
      't=0 0\r\n'+
      'a=group:LS video audio\r\n'+
      'm=video 5000 RTP/AVP 107\r\n'+
      'a=rtpmap:107 H264/90000\r\n'+
      'a=fmtp:107 packetization-mode=1\r\n'+
      'a=mid:video\r\n'+
      'a=sendonly\r\n'+
      'm=audio 5002 RTP/AVP 111\r\n'+
      'a=rtpmap:111 opus/48000/2\r\n'+
      'a=mid:audio\r\n'+
      'a=sendonly\r\n'
  },
  function(rs) {
    debug(`onResponse`);
    if (rs.status >= 300) {
      debug('call failed with status ' + rs.status);
    }
    else if(rs.status < 200) {
      debug('call progress status ' + rs.status);
    }
    else {
      // yes we can get multiple 2xx response with different tags
      debug('call answered with tag ' + rs.headers.to.params.tag);

      if (!callTags[rs.headers.to.params.tag]) {
        callTags[rs.headers.to.params.tag] = true;
        handleAnswer(rs.content);
      }

      // sending ACK
      sip.send({
        method: 'ACK',
        uri: rs.headers.contact[0].uri,
        headers: {
          to: rs.headers.to,
          from: rs.headers.from,
          'call-id': rs.headers['call-id'],
          cseq: {method: 'ACK', seq: rs.headers.cseq.seq},
          via: []
        }
      });

      var id = [rs.headers['call-id'], rs.headers.from.params.tag, rs.headers.to.params.tag].join(':');

      // registring our 'dialog' which is just function to process in-dialog requests
      if (!dialogs[id]) {
        dialogs[id] = function(rq) {
          if (rq.method === 'BYE') {
            debug('call received bye');

            delete dialogs[id];

            sip.send(sip.makeResponse(rq, 200, 'Ok'));
          }
          else {
            sip.send(sip.makeResponse(rq, 405, 'Method not allowed'));
          }
        }
      }
    }
  });
}

const hup = function() {
  // for all calls, send bye
}

const on = function(event, handler) {
  eventHandlers.on(event, handler);
}

module.exports = {
  on,
  invite,
  start,
  hup
}