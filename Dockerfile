FROM ichabod:latest

RUN mkdir -p /var/lib/horseman
WORKDIR /var/lib/horseman
COPY package.json package-lock.json app.js /var/lib/horseman/
RUN npm install zeromq && npm install
