const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Frontend files
app.use(express.static(__dirname));

// Memory file
const memoryFile = path.join(__dirname, "memory.json");

let memory = {
    userName: "",
    founderName: "Saurabh",
    preferences: [],
    facts: [],
    importantInfo: [],
    conversation: []
};

try {
    if (fs.existsSync(memoryFile)) {
        const savedMemory = JSON.parse(
            fs.readFileSync(memoryFile, "utf8")
        );

        memory = {
            ...memory,
            ...savedMemory
        };
    }
} catch (error) {
    console.log("Memory load error:", error.message);
}

// Save memory
function saveMemory() {
    try {
        fs.writeFileSync(
            memoryFile,
            JSON.stringify(memory, null, 2)
        );
    } catch (error) {
        console.log("Memory save error:", error.message);
    }
}

// Home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Server health check
app.get("/health", (req, res) => {
    res.json({
        status: "online",
        message: "MyAI Backend is Running"
    });
});

// Simple memory endpoint
app.get("/memory", (req, res) => {
    res.json(memory);
});

// Save user name
app.post("/memory/name", (req, res) => {
    const { userName } = req.body;

    if (userName) {
        memory.userName = userName;
        saveMemory();
    }

    res.json({
        success: true,
        memory
    });
});

// AI chat
app.post("/chat", async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({
                error: "Message is required"
            });
        }

        const userMessage = message.trim();

        // Founder/name memory
        const lowerMessage = userMessage.toLowerCase();

        if (
            lowerMessage.includes("mera naam") ||
            lowerMessage.includes("my name")
        ) {
            if (memory.userName) {
                return res.json({
                    reply: `Tumhara naam ${memory.userName} hai.`
                });
            }
        }

        if (
            lowerMessage.includes("kisne banaya") ||
            lowerMessage.includes("who created you") ||
            lowerMessage.includes("who made you") ||
            lowerMessage.includes("founder")
        ) {
            return res.json({
                reply: `Mujhe mere founder ${memory.founderName} ne banaya hai.`
            });
        }

        if (!process.env.OPENROUTER_API_KEY) {
            return res.status(500).json({
                error: "OPENROUTER_API_KEY is not configured on server."
            });
        }

        memory.conversation.push({
            role: "user",
            content: userMessage,
            time: new Date().toISOString()
        });

        const messages = [
            {
                role: "system",
                content: `
You are MYAI, a helpful AI assistant.

Your founder is Saurabh.

Be helpful, accurate and friendly.
Reply in the same language/style the user uses.
If the user speaks Hindi/Hinglish, reply in Hindi/Hinglish.
If the user speaks English, reply in English.

User name:
${memory.userName || "Not known"}

Remember useful information from the conversation.
`
            },
            ...memory.conversation.slice(-20).map(item => ({
                role: item.role,
                content: item.content
            }))
        ];

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

        const reply =
            data?.choices?.[0]?.message?.content ||
            "Sorry, mujhe response nahi mila.";

        memory.conversation.push({
            role: "assistant",
            content: reply,
            time: new Date().toISOString()
        });

        saveMemory();

        res.json({
            reply
        });

    } catch (error) {
        console.log("Chat error:", error);

        res.status(500).json({
            error: "Server error: " + error.message
        });
    }
});

// Render port
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`MyAI Backend running on port ${PORT}`);
});
