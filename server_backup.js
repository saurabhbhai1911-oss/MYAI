const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());


// ==========================================
// MEMORY
// ==========================================

const memoryFile = path.join(__dirname, "memory.json");

function createDefaultMemory() {
    return {
        userName: "",
        founderName: "",
        preferences: [],
        facts: [],
        importantInfo: [],
        conversation: []
    };
}


function loadMemory() {
    try {

        if (!fs.existsSync(memoryFile)) {
            return createDefaultMemory();
        }

        const data = fs.readFileSync(
            memoryFile,
            "utf8"
        );

        if (!data.trim()) {
            return createDefaultMemory();
        }

        const saved = JSON.parse(data);

        return {
            ...createDefaultMemory(),
            ...saved
        };

    } catch (error) {

        console.log("Memory load error:", error);

        return createDefaultMemory();
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


// ==========================================
// REMEMBER USER INFORMATION
// ==========================================

function rememberInfo(message, memory) {

    const nameMatch = message.match(
        /(?:mera naam|my name is|naam mera)\s+(?:hai\s+)?([a-zA-Z][a-zA-Z ]{1,30})/i
    );

    if (nameMatch) {

        const name = nameMatch[1]
            .replace(/\s+hai$/i, "")
            .trim();

        if (name) {
            memory.userName = name;
        }
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


// ==========================================
// MEMORY CONTEXT
// ==========================================

function buildMemoryContext(memory) {

    let context = "";

    if (memory.userName) {

        context +=
            `User's name: ${memory.userName}\n`;
    }


    if (memory.founderName) {

        context +=
            `MyAI founder/owner: ${memory.founderName}\n`;
    }


    if (memory.preferences.length > 0) {

        context +=
            "User preferences:\n" +
            memory.preferences
                .slice(-20)
                .map(item => "- " + item)
                .join("\n") +
            "\n";
    }


    if (memory.facts.length > 0) {

        context +=
            "User facts:\n" +
            memory.facts
                .slice(-20)
                .map(item => "- " + item)
                .join("\n") +
            "\n";
    }


    if (memory.importantInfo.length > 0) {

        context +=
            "Important information:\n" +
            memory.importantInfo
                .slice(-30)
                .map(item => "- " + item)
                .join("\n") +
            "\n";
    }

    return context;
}


// ==========================================
// WIKIPEDIA SEARCH
// ==========================================

async function searchWikipedia(query) {

    try {

        const response = await axios.get(
            "https://en.wikipedia.org/w/rest.php/v1/search/page",
            {
                params: {
                    q: query,
                    limit: 3
                },

                headers: {
                    "User-Agent": "MyAI/1.0"
                },

                timeout: 8000
            }
        );


        const pages =
            response.data?.pages || [];


        if (pages.length === 0) {
            return "";
        }


        let result = "WIKIPEDIA SEARCH RESULTS:\n\n";


        pages.forEach((page, index) => {

            result +=
                `${index + 1}. ${page.title}\n`;

            if (page.description) {

                result +=
                    `Description: ${page.description}\n`;
            }

            if (page.excerpt) {

                result +=
                    `Excerpt: ${page.excerpt}\n`;
            }

            if (page.key) {

                result +=
                    `Wikipedia page: https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}\n`;
            }

            result += "\n";
        });


        return result;

    } catch (error) {

        console.log(
            "Wikipedia search error:",
            error.message
        );

        return "";
    }
}


// ==========================================
// CHECK IF SEARCH IS NEEDED
// ==========================================

function needsWikipediaSearch(message) {

    const text =
        message.toLowerCase().trim();


    const searchWords = [

        "search",
        "google",
        "internet",
        "web",
        "online",
        "wikipedia",
        "who is",
        "what is",
        "what are",
        "who was",
        "history of",
        "information about",
        "tell me about",
        "kya hai",
        "kaun hai",
        "ke bare mein",
        "ke baare mein",
        "history",
        "meaning of"

    ];


    return searchWords.some(
        word => text.includes(word)
    );
}


// ==========================================
// HOME
// ==========================================

app.get("/", (req, res) => {

    res.send(
        "MyAI Backend is running successfully."
    );
});


// ==========================================
// STREAMING CHAT API
// ==========================================

app.post("/api/chat", async (req, res) => {

    try {

        const message =
            String(req.body.message || "").trim();


        if (!message) {

            return res.status(400).json({
                reply: "Message empty hai."
            });
        }


        // ==================================
        // LOAD MEMORY
        // ==================================

        let memory = loadMemory();

        memory = rememberInfo(message, memory);


        memory.conversation.push({
            role: "user",
            content: message
        });


        if (memory.conversation.length > 60) {

            memory.conversation =
                memory.conversation.slice(-60);
        }


        const memoryContext =
            buildMemoryContext(memory);


        const recentConversation =
            memory.conversation.slice(-10);


        // ==================================
        // WIKIPEDIA SEARCH
        // ==================================

        let webContext = "";

        if (needsWikipediaSearch(message)) {

            console.log(
                "Wikipedia search:",
                message
            );

            webContext =
                await searchWikipedia(message);
        }


        // ==================================
        // AI MESSAGES
        // ==================================

        const messages = [

            {
                role: "system",

                content: `
You are MyAI, a helpful personal AI assistant.

Your name is MyAI.

Remember the user's stored information.
If asked "Mera naam kya hai?", answer from memory.
New Chat does not delete permanent memory.

Language rules:
English input = English.
Hindi input = Hindi.
Roman Hindi/Hinglish = Roman Hinglish.
Do not randomly switch languages.

IMPORTANT SEARCH RULES:

If WIKIPEDIA SEARCH RESULTS are provided below,
use them as additional information.

Do not pretend that Wikipedia results are live internet
results or current news.

If the search results do not contain enough information,
say that the available information is limited.

If you use information from Wikipedia,
you may mention that it came from Wikipedia.

USER MEMORY:
${memoryContext}

${webContext}
`
            },

            ...recentConversation.map(item => ({

                role:
                    item.role === "assistant"
                        ? "assistant"
                        : "user",

                content: item.content

            }))

        ];


        // ==================================
        // STREAM RESPONSE HEADERS
        // ==================================

        res.setHeader(
            "Content-Type",
            "text/event-stream"
        );

        res.setHeader(
            "Cache-Control",
            "no-cache"
        );

        res.setHeader(
            "Connection",
            "keep-alive"
        );

        res.flushHeaders();


        // ==================================
        // OPENROUTER STREAMING REQUEST
        // ==================================

        const response = await axios.post(

            "https://openrouter.ai/api/v1/chat/completions",

            {
                model: "openrouter/free",

                messages: messages,

                temperature: 0.3,

                stream: true
            },

            {
                responseType: "stream",

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


        // ==================================
        // RECEIVE STREAM
        // ==================================

        let fullReply = "";

        let buffer = "";


        response.data.on("data", (chunk) => {

            buffer += chunk.toString();

            const lines =
                buffer.split("\n");

            buffer =
                lines.pop() || "";


            for (const line of lines) {

                const trimmed =
                    line.trim();


                if (!trimmed) {
                    continue;
                }


                if (!trimmed.startsWith("data:")) {
                    continue;
                }


                const data =
                    trimmed.slice(5).trim();


                if (data === "[DONE]") {
                    continue;
                }


                try {

                    const json =
                        JSON.parse(data);


                    const text =
                        json.choices?.[0]?.delta?.content || "";


                    if (text) {

                        fullReply += text;


                        res.write(
                            `data: ${JSON.stringify({
                                text: text
                            })}\n\n`
                        );
                    }

                } catch (error) {

                    // Ignore incomplete stream chunks
                }
            }
        });


        // ==================================
        // STREAM FINISHED
        // ==================================

        response.data.on("end", () => {

            memory.conversation.push({

                role: "assistant",

                content:
                    fullReply ||
                    "MyAI se response nahi mila."
            });


            if (memory.conversation.length > 60) {

                memory.conversation =
                    memory.conversation.slice(-60);
            }


            saveMemory(memory);


            res.write(
                `data: ${JSON.stringify({
                    done: true
                })}\n\n`
            );


            res.end();
        });


        // ==================================
        // STREAM ERROR
        // ==================================

        response.data.on("error", (error) => {

            console.log(
                "STREAM ERROR:",
                error.message
            );


            if (!res.writableEnded) {

                res.write(
                    `data: ${JSON.stringify({
                        error: "Streaming error aa gaya."
                    })}\n\n`
                );

                res.end();
            }
        });


    } catch (error) {

        console.log(
            "AI ERROR:",
            error.response?.data ||
            error.message
        );


        if (!res.headersSent) {

            res.status(500).json({

                reply:
                    "MyAI mein error aa gaya. Termux mein error check karo."

            });

        } else {

            res.write(
                `data: ${JSON.stringify({
                    error:
                        "MyAI mein error aa gaya."
                })}\n\n`
            );

            res.end();
        }
    }
});


// ==========================================
// START SERVER
// ==========================================

app.listen(

    3000,

    "127.0.0.1",

    () => {

        console.log(
            "MyAI Backend running on http://127.0.0.1:3000"
        );

    }
);
