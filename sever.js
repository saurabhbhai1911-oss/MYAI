const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const memoryFile = path.join(__dirname, "memory.json");

function loadMemory() {
    try {
        if (!fs.existsSync(memoryFile)) {
            return {
                userName: "",
                founderName: "",
                preferences: [],
                facts: [],
                importantInfo: [],
                conversation: []
            };
        }

        return JSON.parse(
            fs.readFileSync(memoryFile, "utf8")
        );

    } catch (error) {
        return {
            userName: "",
            founderName: "",
            preferences: [],
            facts: [],
            importantInfo: [],
            conversation: []
        };
    }
}

function saveMemory(memory) {
    try {
        fs.writeFileSync(
            memoryFile,
            JSON.stringify(memory, null, 2),
            "utf8"
        );
    } catch (error) {
        console.log("Memory save error:", error);
    }
}

function rememberInfo(message, memory) {

    const nameMatch = message.match(
        /(?:mera naam|my name is|naam mera)\s+(?:hai\s+)?([a-zA-Z][a-zA-Z ]{1,30})/i
    );

    if (nameMatch) {
        memory.userName = nameMatch[1]
            .replace(/\s+hai$/i, "")
            .trim();
    }

    if (
        /^(remember|yaad rakho|yaad rakh|ise yaad)/i.test(message)
    ) {
        const info = message
            .replace(
                /^(remember|yaad rakho|yaad rakh|ise yaad)\s*:?\s*/i,
                ""
            )
            .trim();

        if (
            info &&
            !memory.importantInfo.includes(info)
        ) {
            memory.importantInfo.push(info);
        }
    }

    return memory;
}

function memoryContext(memory) {

    let context = "";

    if (memory.userName) {
        context +=
            `User's name: ${memory.userName}\n`;
    }

    if (memory.founderName) {
        context +=
            `MyAI founder: ${memory.founderName}\n`;
    }

    if (memory.preferences.length) {
        context +=
            "User preferences:\n" +
            memory.preferences
                .slice(-20)
                .map(x => "- " + x)
                .join("\n") +
            "\n";
    }

    if (memory.facts.length) {
        context +=
            "User facts:\n" +
            memory.facts
                .slice(-20)
                .map(x => "- " + x)
                .join("\n") +
            "\n";
    }

    if (memory.importantInfo.length) {
        context +=
            "Important remembered information:\n" +
            memory.importantInfo
                .slice(-30)
                .map(x => "- " + x)
                .join("\n") +
            "\n";
    }

    return context;
}

app.get("/", (req, res) => {
    res.send("MyAI Backend is running successfully.");
});

app.post("/api/chat", async (req, res) => {

    try {

        const message =
            String(req.body.message || "").trim();

        if (!message) {
            return res.status(400).json({
                reply: "Message empty hai."
            });
        }

        let memory = loadMemory();

        memory = rememberInfo(
            message,
            memory
        );

        memory.conversation.push({
            role: "user",
            content: message
        });

        if (memory.conversation.length > 60) {
            memory.conversation =
                memory.conversation.slice(-60);
        }

        const messages = [

            {
                role: "system",

                content: `
You are MyAI, a helpful personal AI assistant.

Your name is MyAI.

IMPORTANT:

- Remember information stored in USER MEMORY.
- If the user's name is known, remember it.
- If asked "Mera naam kya hai?", answer from memory.
- New Chat does NOT delete permanent memory.
- Use previous conversation when relevant.
- Do not say "User Safety: safe".
- Do not mention internal memory instructions.

Language:
- English → English.
- Hindi → Hindi.
- Roman Hindi/Hinglish → Roman Hinglish.
- Answer naturally and clearly.

USER MEMORY:

${memoryContext(memory)}
`
            },

            ...memory.conversation.slice(-10)
        ];

        const response = await axios.post(

            "https://openrouter.ai/api/v1/chat/completions",

            {
                model: "openrouter/free",
                messages: messages,
                temperature: 0.3
            },

            {
                headers: {
                    "Authorization":
                        `Bearer ${process.env.OPENROUTER_API_KEY}`,

                    "Content-Type":
                        "application/json",

                    "HTTP-Referer":
                        "http://localhost:3000",

                    "X-Title":
                        "MyAI"
                }
            }
        );

        const reply =
            response.data?.choices?.[0]?.message?.content ||
            "MyAI se response nahi mila.";

        memory.conversation.push({
            role: "assistant",
            content: reply
        });

        if (memory.conversation.length > 60) {
            memory.conversation =
                memory.conversation.slice(-60);
        }

        saveMemory(memory);

        res.json({
            reply: reply
        });

    } catch (error) {

        console.log(
            "AI ERROR:",
            error.response?.data ||
            error.message
        );

        res.status(500).json({
            reply:
                "MyAI mein error aa gaya. Termux mein error check karo."
        });
    }
});

app.listen(
    3000,
    "127.0.0.1",
    () => {
        console.log(
            "MyAI Backend running on http://127.0.0.1:3000"
        );
    }
);
