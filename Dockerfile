# Usa l'immagine ufficiale Node.js con Chromium preinstallato
FROM node:18-slim

# Installa le dipendenze di sistema necessarie per far girare Chromium headless
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libsqlite3-0 \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Crea la cartella di lavoro
WORKDIR /usr/src/app

# Copia i file del pacchetto e installa le dipendenze
COPY package*.json ./
RUN npm install

# Copia tutto il resto del codice (inclusi index.js e cookies.json)
COPY . .

# Espone la porta usata dal Server Web Express per UptimeRobot
EXPOSE 3000

# Avvia il bot
CMD ["node", "index.js"]
