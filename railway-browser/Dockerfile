FROM mcr.microsoft.com/playwright:v1.55.0-noble

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      xvfb fluxbox x11vnc novnc websockify \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN chmod +x /app/start.sh

ENV PORT=8080
ENV DISPLAY=:99
ENV RMF_BROWSER_PROFILE_DIR=/data/browser-profile

CMD ["/app/start.sh"]
