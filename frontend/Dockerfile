FROM node:18-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY .env ./.env
RUN npm install

COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app

COPY --from=builder /app/.output /app/.output
COPY --from=builder /app/node_modules /app/node_modules
COPY .env ./.env

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]