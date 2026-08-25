FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

COPY package*.json ./

# Sostituito ci con install
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
