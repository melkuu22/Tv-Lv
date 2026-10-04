FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY apps apps
COPY packages packages
COPY database database
ENV NODE_ENV=production
ENV PORT=4173
EXPOSE 4173
CMD ["node", "--experimental-strip-types", "apps/api/src/main.ts"]
