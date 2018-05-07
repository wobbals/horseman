const dgram = require('dgram');
const stun = require('stun');

const { STUN_BINDING_REQUEST, STUN_ATTR_XOR_MAPPED_ADDRESS } = stun.constants;

let getPortMapping = function(port) {
  return new Promise((resolve, reject) => {
    let socket = dgram.createSocket('udp4');
    socket.bind(port);
    let server = stun.createServer(socket);
    server.on('bindingResponse', stunMsg => {
      let result = {
        internal: socket.address(),
        external: stunMsg.getAttribute(STUN_ATTR_XOR_MAPPED_ADDRESS).value
      };
      socket.close();
      server.close();
      resolve(result);
    });
    server.on('bindingError', error => {
      socket.close();
      server.close();
      reject(error);
    });
    let request = stun.createMessage(STUN_BINDING_REQUEST);
    server.send(request, 19302, 'stun.l.google.com');
  });
}

module.exports = {
  getPortMapping
};

  // "stun.l.google.com:19302",
  // "stun1.l.google.com:19302",
  // "stun2.l.google.com:19302",
  // "stun3.l.google.com:19302",
  // "stun4.l.google.com:19302",
