FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./tsconfig.json
RUN npx prisma generate
RUN npx tsc -p tsconfig.json
EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push && node dist/server.js"]
