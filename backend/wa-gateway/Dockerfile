# WA Gateway (whatsapp-web.js) — Chrome headless via Puppeteer.
FROM node:20-slim
WORKDIR /app

# Google Chrome Stable + libs p/ whatsapp-web.js (puppeteer) + ffmpeg (voz) + tzdata
RUN apt-get update && apt-get install -y wget gnupg tzdata ffmpeg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    TZ=America/Sao_Paulo

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3333
CMD ["npm", "start"]
