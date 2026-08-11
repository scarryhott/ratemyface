FROM mcr.microsoft.com/playwright:v1.62.1-noble

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      xvfb fluxbox x11vnc novnc websockify wget gnupg ca-certificates \
 && mkdir -p /etc/apt/keyrings \
 && wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
 && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN chmod +x /app/start.sh

ENV PORT=8080
ENV DISPLAY=:99
ENV RMF_BROWSER_PROFILE_DIR=/data/browser-profile
ENV RMF_BROWSER_EXECUTABLE=/usr/bin/google-chrome

CMD ["/app/start.sh"]
