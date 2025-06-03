import express from 'express';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import TelegramBot from 'node-telegram-bot-api';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startBot();
});

const wss = new WebSocketServer({ server });
let clients = [];

wss.on('connection', (ws) => {
    clients.push(ws);
    console.log('New client connected. Total:', clients.length);

    ws.on('close', () => {
        clients = clients.filter(client => client !== ws);
        console.log('Client disconnected. Total:', clients.length);
    });
});

function broadcast(data) {
    clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify(data));
        }
    });
}

const DATA_DIR = './data';
const REQUESTS_FILE = `${DATA_DIR}/requests.json`;
const USERS_FILE = `${DATA_DIR}/notification_users.json`;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(REQUESTS_FILE)) fs.writeFileSync(REQUESTS_FILE, '[]');
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

function readData(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

app.get('/requests', (_, res) => {
    res.json(readData(REQUESTS_FILE));
});

app.post('/requests', (req, res) => {
    const requests = readData(REQUESTS_FILE);
    const newRequest = { ...req.body, id: Date.now() };
    requests.push(newRequest);
    writeData(REQUESTS_FILE, requests);
    broadcast({ type: 'new-request', data: newRequest });
    res.status(201).json(newRequest);
});

app.delete('/requests/:id', (req, res) => {
    const id = Number(req.params.id);
    let requests = readData(REQUESTS_FILE);
    requests = requests.filter(req => req.id !== id);
    writeData(REQUESTS_FILE, requests);
    broadcast({ type: 'delete-request', id });
    res.sendStatus(204);
});

app.post('/register-user', (req, res) => {
    const users = readData(USERS_FILE);
    if (!users.includes(req.body.username)) {
        users.push(req.body.username);
        writeData(USERS_FILE, users);
    }
    res.sendStatus(200);
});

function startBot() {
    const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

    bot.onText(/\/start/, msg => {
        bot.sendMessage(msg.chat.id, 'Вы подписаны на уведомления о новых заявках.');
        const users = readData(USERS_FILE);
        if (!users.includes(msg.from.username)) {
            users.push(msg.from.username);
            writeData(USERS_FILE, users);
        }
    });

    app.post('/notify', (req, res) => {
        const { text } = req.body;
        const users = readData(USERS_FILE);
        users.forEach(username => {
            bot.sendMessage(`@${username}`, text);
        });
        res.sendStatus(200);
    });
}
