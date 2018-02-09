FROM gst-ichabod:latest

RUN mkdir -p /var/lib/horseman
WORKDIR /var/lib/horseman
COPY package.json package-lock.json app.js /var/lib/horseman/
COPY lib /var/lib/horseman/lib
COPY config /var/lib/horseman/config
RUN npm install zeromq && npm install
