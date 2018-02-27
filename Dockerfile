FROM    node:alpine

WORKDIR /app

COPY    package.json /app
RUN     npm install --production

COPY    index.js /app
CMD     ["node", "index.js"]
