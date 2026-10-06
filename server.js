const express = require("express");
const dotenv = require("dotenv");
const fs = require("fs");
const cors = require("cors");
const path = require("path");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ===============================
// FRONTEND
// ===============================
app.use(express.static(__dirname));

// ===============================
// USER MEMORY
// ===============================

// All users' memories are stored separately by userId.
// This file is blocked from public access below.
const usersMemoryFile = path.join(__dirname, "users-memory.json");

let usersMemory = {};

try {
    if (fs.existsSync(usersMemoryFile)) {
        const saved = fs.readFileSync(usersMemoryFile, "utf8");

        if (saved.trim()) {
            usersMemory = JSON.parse(saved);
        }
    }
} catch (error) {
    console.log("User memory load error:", error.message);
    usersMemory = {};
}

// Save all user memories
function saveUsersMemory() {
    try {
        fs.writeFileSync(
            usersMemoryFile,
            JSON.stringify(usersMemory, null, 2),
            "utf8"
        );
    } catch (error) {
        console.log("User memory save error:", error.message);
    }
}

// Get/create memory for one user
function getUserMemory(userId) {
    if (!userId) {
        return null;
    }

    if (!usersMemory[userId]) {
        usersMemory[userId] = {
            userName: null,
            preferences: [],
            facts: [],
            importantInfo: [],
            conversation: []
        };
    }

    return usersMemory[userId];
}

// ===============================
// SECURITY
// ===============================

// Never allow memory files to be opened directly
app.use((req, res, next) => {
    const blockedFiles = [
        "/users-memory.json",
        "/memory.json",
        "/memory",
        "/users-memory"
    ];

    if (blockedFiles.includes(req.path)) {
        return res.status(403).json({
            error: "Access denied"
        });
    }

    next();
});

// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// ===============================
// HEALTH CHECK
// ===============================

app.get("/health", (req, res) => {
    res.json({
        status: "online",
        message: "MyAI Backend is Running"
    });
});

// ===============================
// GET USER MEMORY
// ===============================

app.get("/my-memory", (req, res) => {
    const userId = req.headers["x-user-id"];

    if (!userId) {
        return res.status(400).json({
            error: "User ID required"
        });
    }

    const memory = getUserMemory(userId);

    res.json({
        success: true,
        memory: {
            userName: memory.userName
        }
    });
});

// ===============================
// SAVE USER NAME
// ===============================

app.post("/memory/name", (req, res) => {
    const userId = req.headers["x-user-id"];
    const { userName } = req.body;

    if (!userId) {
        return res.status(400).json({
            error: "User ID required"
        });
    }

    if (!userName || !userName.trim()) {
        return res.status(400).json({
            error: "Name required"
        });
    }

    const memory = getUserMemory(userId);

    memory.userName = userName.trim();

    saveUsersMemory();

    res.json({
        success: true,
        message: "Name saved",
        userName: memory.userName
    });
});

// ===============================
// NAME DETECTION
// ===============================

function detectName(message) {
    const text = message.trim();

    const patterns = [
        /(?:mera naam|मेरा नाम)\s+([a-zA-Z\u0900-\u097F][a-zA-Z\u0900-\u097F ]{1,30}?)(?:\s+hai|\s+है|$)/i,

        /(?:my name is)\s+([a-zA-Z][a-zA-Z ]{1,30}?)(?:\s+is|\s+hai|$)/i,

        /(?:call me)\s+([a-zA-Z][a-zA-Z ]{1,30}?)(?:\s+please|$)/i,

        /(?:i am|i'm)\s+([a-zA-Z][a-zA-Z ]{1,30}?)(?:\s+and|\s+from|\s+hai|$)/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);

        if (match && match[1]) {
            let name = match[1].trim();

            // Remove common ending words
            name = name.replace(/\s+(hai|है)$/i, "").trim();

            if (name.length >= 2 && name.length <= 30) {
                return name;
            }
        }
    }

    return null;
}

// ===============================
// FOUNDER CHECK
// ===============================

function isFounderQuestion(message) {
    const text = message.toLowerCase();

    return (
        text.includes("founder") ||
        text.includes("who made you") ||
        text.includes("who created you") ||
        text.includes("who built you") ||
        text.includes("kisne banaya") ||
        text.includes("kisne bnaya") ||
        text.includes("tumhe kisne banaya") ||
        text.includes("aapko kisne banaya")
    );
}

// ===============================
// AI CHAT
// ===============================

app.post("/chat", async (req, res) => {
    try {
        const userId = req.headers["x-user-id"];
        const message = req.body.message;

        if (!userId) {
            return res.status(400).json({
                error: "User ID required"
            });
        }

        if (!message || !message.trim()) {
            return res.status(400).json({
                error: "Message is required"
            });
        }

        const userMessage = message.trim();

        const memory = getUserMemory(userId);

        // --------------------------------
        // FOUNDER
        // --------------------------------

        if (isFounderQuestion(userMessage)) {
            return res.json({
                reply: "Mujhe mere founder Saurabh ne banaya hai."
            });
        }

        // --------------------------------
        // NAME MEMORY
        // --------------------------------

        const detectedName = detectName(userMessage);

        if (detectedName) {
            memory.userName = detectedName;
            saveUsersMemory();

            return res.json({
                reply: `Nice to meet you, ${detectedName}! Main tumhara naam yaad rakhunga.`
            });
        }

        // --------------------------------
        // API KEY CHECK
        // --------------------------------

        if (!process.env.OPENROUTER_API_KEY) {
            return res.status(500).json({
                error: "OPENROUTER_API_KEY is not configured on server."
            });
        }

        // --------------------------------
        // SAVE USER MESSAGE
        // --------------------------------

        memory.conversation.push({
            role: "user",
            content: userMessage,
            time: new Date().toISOString()
        });

        // Keep only latest 20 messages
        if (memory.conversation.length > 20) {
            memory.conversation = memory.conversation.slice(-20);
        }

        // --------------------------------
        // SYSTEM PROMPT
        // --------------------------------

        const systemPrompt = `
You are MYAI, a helpful personal AI assistant.

Your founder is Saurabh.

IMPORTANT PRIVACY RULES:
- Never assume that the current user is Saurabh.
- Never call a user Saurabh unless that user has explicitly told you their name is Saurabh.
- Each user has separate memory.
- Never reveal another user's information, name, conversation, facts, or memory.
- Only use the memory supplied for the current user.
- Do not claim to know information that is not in the current user's memory.

USER INFORMATION:
Name: ${memory.userName || "Unknown"}

If the user's name is unknown, talk normally without using a name.

Be helpful, accurate and friendly.

If the user speaks Hindi/Hinglish, reply in Hindi/Hinglish.
If the user speaks English, reply in English.
Keep the language consistent with the user.

FOUNDER:
Saurabh is the founder of MYAI.
`;

        // --------------------------------
        // CONVERSATION FOR THIS USER ONLY
        // --------------------------------

        const messages = [
            {
                role: "system",
                content: systemPrompt
            },
            ...memory.conversation.slice(-20).map(item => ({
                role: item.role,
                content: item.content
            }))
        ];

        // --------------------------------
        // OPENROUTER
        // --------------------------------

        const response = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Authorization":
                        `Bearer ${process.env.OPENROUTER_API_KEY}`,

                    "Content-Type": "application/json",

                    "HTTP-Referer":
                        "https://myai-2-wkxz.onrender.com",

                    "X-Title": "MYAI"
                },

                body: JSON.stringify({
                    model: "nvidia/nemotron-3.5-lightning:free",
                    messages: messages
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.log("OpenRouter error:", data);

            return res.status(response.status).json({
                error:
                    data?.error?.message ||
                    "OpenRouter request failed."
            });
        }

        // --------------------------------
        // AI REPLY
        // --------------------------------

        const reply =
            data?.choices?.[0]?.message?.content ||
            "Sorry, mujhe abhi reply nahi mila.";

        // --------------------------------
        // SAVE AI REPLY
        // --------------------------------

        memory.conversation.push({
            role: "assistant",
            content: reply,
            time: new Date().toISOString()
        });

        if (memory.conversation.length > 20) {
            memory.conversation = memory.conversation.slice(-20);
        }

        saveUsersMemory();

        res.json({
            reply: reply
        });

    } catch (error) {
        console.log("Chat error:", error);

        res.status(500).json({
            error: "Server error: " + error.message
        });
    }
});

// ===============================
// RENDER PORT
// ===============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`MyAI Backend running on port ${PORT}`);
});
