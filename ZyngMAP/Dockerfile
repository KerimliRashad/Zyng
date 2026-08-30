FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

RUN npm install
RUN cd frontend && npm install
RUN cd backend && npm install

COPY . .

RUN cd frontend && npm run build

EXPOSE 3000 5000

CMD ["sh", "-c", "cd backend && npm start & cd frontend && npm run preview -- --host"]
