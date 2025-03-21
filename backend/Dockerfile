FROM node:18-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --production --force

COPY . .

RUN rm -rf node_modules && npm install --production --force

EXPOSE 5000

CMD ["node", "index.js"]
