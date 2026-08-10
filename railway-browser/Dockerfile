FROM mcr.microsoft.com/playwright:v1.55.0-noble
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=8080
ENV RMF_BROWSER_PROFILE_DIR=/data/browser-profile
CMD ["npm","start"]
