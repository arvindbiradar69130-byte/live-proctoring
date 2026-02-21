import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

// JSON based Mock Storage as requested for Demo
const MOCK_DB = {
    users: [],
    examSessions: [],
    logs: []
};

// --- REST API ENDPOINTS ---

// 1. Authentication
app.post('/api/auth/login', (req, res) => {
    const { username, faceEmbedding } = req.body;
    // Simulated authentication: Face auth would check embeddings
    let user = MOCK_DB.users.find(u => u.username === username);
    if (!user) {
        user = { id: Date.now().toString(), username, status: 'active' };
        MOCK_DB.users.push(user);
    }
    res.json({ success: true, user, token: `fake-jwt-token-${user.id}` });
});

// 2. Start Exam
app.post('/api/exam/start', (req, res) => {
    const { userId, examId } = req.body;
    const session = {
        id: Date.now().toString(),
        userId,
        examId,
        startTime: new Date(),
        riskScore: 0,
        warnings: 0,
        status: 'ongoing'
    };
    MOCK_DB.examSessions.push(session);
    res.json({ success: true, session });
});

// 3. Log Suspicious Event (Cheating Detection Engine)
app.post('/api/exam/event', (req, res) => {
    const { sessionId, eventType, timestamp, metadata } = req.body;

    const session = MOCK_DB.examSessions.find(s => s.id === sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Update Risk Score
    const eventRiskScore = calculateRisk(eventType);
    session.riskScore = Math.min(100, session.riskScore + eventRiskScore);

    // If risky, increment warnings
    if (eventRiskScore > 0) {
        session.warnings += 1;
        // Emit real-time warning via Socket.IO
        io.to(sessionId).emit('warning', {
            type: eventType,
            message: getWarningMessage(eventType),
            currentWarnings: session.warnings,
            riskScore: session.riskScore
        });
    }

    // Auto fail logic or high risk flag
    if (session.warnings >= 3) {
        session.status = 'high_risk';
        io.to(sessionId).emit('high_risk', { message: 'High risk marked: Too many warnings.' });
    }

    const logEntry = { id: Date.now().toString(), sessionId, eventType, timestamp, metadata, impact: eventRiskScore };
    MOCK_DB.logs.push(logEntry);

    res.json({ success: true, log: logEntry, session });
});

// 4. Generate Auto Report
app.get('/api/exam/report/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = MOCK_DB.examSessions.find(s => s.id === sessionId);
    const sessionLogs = MOCK_DB.logs.filter(l => l.sessionId === sessionId);

    if (!session) return res.status(404).json({ error: 'Session not found' });

    res.json({
        success: true,
        report: {
            session,
            events: sessionLogs,
            totalWarnings: session.warnings,
            finalRiskScore: session.riskScore
        }
    });
});


// Helper functions for AI Mocking Logic
function calculateRisk(eventType) {
    switch (eventType) {
        case 'tab_switch': return 15;
        case 'no_face': return 20;
        case 'multiple_faces': return 35;
        case 'looking_away': return 10;
        case 'voice_detected': return 25;
        case 'fast_answering': return 5;
        default: return 0;
    }
}

function getWarningMessage(eventType) {
    switch (eventType) {
        case 'tab_switch': return 'Warning: Please stay on the exam tab.';
        case 'no_face': return 'Warning: No face detected in webcam.';
        case 'multiple_faces': return 'Warning: Multiple faces detected!';
        case 'looking_away': return 'Warning: Please stay focused on the screen.';
        case 'voice_detected': return 'Warning: Voice detected in the background.';
        default: return 'Warning: Suspicious activity detected.';
    }
}

// --- WEBSOCKET HANDLER ---
io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    socket.on('join_session', (sessionId) => {
        socket.join(sessionId);
        console.log(`Socket ${socket.id} joined session ${sessionId}`);
    });

    socket.on('chat_message', (data) => {
        // AI Chatbot Invigilator mock
        const reply = getAIInvigilatorReply(data.message);
        setTimeout(() => {
            socket.emit('chat_reply', { sender: 'Invigilator', text: reply });
        }, 1000);
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

function getAIInvigilatorReply(message) {
    const msg = message.toLowerCase();
    if (msg.includes('help')) return 'I am your virtual invigilator. Please stay focused on the exam. Do you have a technical issue?';
    if (msg.includes('time')) return 'The timer is displayed on your screen. Please manage your time effectively.';
    return 'Please remain quiet and focus on your exam. Unnecessary chatting may be flagged.';
}

const PORT = 5000;
server.listen(PORT, () => {
    console.log(`AI Proctoring Backend running on port ${PORT}`);
});
