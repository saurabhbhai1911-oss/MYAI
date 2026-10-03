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

        console.log(
            "Memory load error:",
            error.message
        );

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

        console.log(
            "Memory save error:",
            error.message
        );
    }
}


// ==========================================
// REMEMBER USER INFORMATION
// ==========================================

function rememberInfo(message, memory) {

    const text = message.trim();


    // ==================================
    // USER NAME
    // ==================================

    const nameMatch = text.match(
        /(?:mera naam|my name is|naam mera)\s+(?:hai\s+)?([a-zA-Z][a-zA-Z .'-]{0,40})/i
    );

    if (nameMatch) {

        const name = nameMatch[1]
            .replace(/\s+hai$/i, "")
            .trim();

        if (name) {
            memory.userName = name;
        }
    }


    // ==================================
    // FOUNDER / OWNER
    // ==================================

    if (
        /(?:i am|i'm|main|mai|mein)\s+(?:the\s+)?(?:founder|owner|creator|maker|developer)/i.test(text) ||
        /(?:founder|owner|creator|maker)\s+(?:of\s+)?(?:myai|this ai|this website)/i.test(text)
    ) {

        if (memory.userName) {
            memory.founderName = memory.userName;
        }
    }


    // ==================================
    // EXPLICIT FOUNDER NAME
    // ==================================

    const founderMatch = text.match(
        /(?:founder|owner|creator|maker)\s+(?:is|hai|ka naam hai)\s+([a-zA-Z][a-zA-Z .'-]{0,40})/i
    );

    if (founderMatch) {

        const founder = founderMatch[1].trim();

        if (founder) {
            memory.founderName = founder;
        }
    }


    // ==================================
    // REMEMBER IMPORTANT INFORMATION
    // ==================================

    if (
        /^(remember|yaad rakho|yaad rakh|ise yaad)/i.test(text)
    ) {

        const info = text
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
// TAVILY WEB SEARCH
// ==========================================

async function searchTavily(query) {

    try {

        const apiKey =
            process.env.TAVILY_API_KEY;


        if (!apiKey) {

            console.log(
                "TAVILY_API_KEY not found."
            );

            return "";
        }


        const response = await axios.post(

            "https://api.tavily.com/search",

            {
                api_key: apiKey,
                query: query,
                search_depth: "basic",
                topic: "general",
                max_results: 5,
                include_answer: true
            },

            {
                headers: {
                    "Content-Type":
                        "application/json"
                },

                timeout: 10000
            }
        );


        const results =
            response.data?.results || [];


        if (results.length === 0) {
            return "";
        }


        let output =
            "TAVILY WEB SEARCH RESULTS:\n\n";


        if (response.data?.answer) {

            output +=
                "Summary:\n" +
                response.data.answer +
                "\n\n";
        }


        results.forEach((item, index) => {

            output +=
                `${index + 1}. ${item.title || "No title"}\n`;

            if (item.content) {

                output +=
                    `Content: ${item.content}\n`;
            }

            if (item.url) {

                output +=
                    `Source: ${item.url}\n`;
            }

            output += "\n";
        });


        return output;

    } catch (error) {

        console.log(
            "Tavily search error:",
            error.response?.data ||
            error.message
        );

        return "";
    }
}


// ==========================================
// CHECK IF WEB SEARCH IS NEEDED
// ==========================================

function needsWebSearch(message) {

    const text =
        message.toLowerCase().trim();


    const searchWords = [

        "search",
        "google",
        "internet",
        "web",
        "online",
        "latest",
        "today",
        "current",
        "news",
        "recent",
        "price",
        "weather",
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
// HEALTH CHECK
// ==========================================

app.get("/", (req, res) => {

    res.json({
        status: "online",
        message: "MyAI Backend is running."
    });

});


// ==========================================
// MEMORY TEST
// ==========================================

app.get("/api/memory", (req, res) => {

    const memory = loadMemory();

    res.json(memory);

});


// ==========================================
// CHAT API
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


        memory =
            rememberInfo(message, memory);


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
        // WEB SEARCH
        // ==================================

        let webContext = "";


        if (needsWebSearch(message)) {

            console.log(
                "Tavily search:",
                message
            );


            webContext =
                await searchTavily(message);
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

If asked "Mera naam kya hai?",
answer using the stored user's name.

If asked who created, built, founded, owns,
or made MyAI, answer using the stored
founder/owner name.

New Chat does not delete permanent memory.

IMPORTANT:
Never invent a user's name or founder name.
If the information is not stored, say that
you do not have that information.

LANGUAGE RULES:

English input = English.

Hindi input = Hindi.

Roman Hindi/Hinglish = Roman Hinglish.

Do not randomly switch languages.

WEB SEARCH RULES:

If TAVILY WEB SEARCH RESULTS are provided,
use them as additional information.

Do not claim search results are your own knowledge.

If the search results are insufficient,
clearly say that the available search information
is limited.

When appropriate, mention the source.

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
            "no-cache, no-transform"
        );

        res.setHeader(
            "Connection",
            "keep-alive"
        );

        res.setHeader(
            "X-Accel-Buffering",
            "no"
        );


        res.flushHeaders();


        // ==================================
        // OPENROUTER
        // ==================================

        const apiKey =
            process.env.OPENROUTER_API_KEY;


        if (!apiKey) {

            return res.end(
                `data: ${JSON.stringify({
                    error:
                        "OPENROUTER_API_KEY nahi mila."
                })}\n\n`
            );
        }


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
                        `Bearer ${apiKey}`,

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


        response.data.on(
            "data",
            (chunk) => {

                buffer +=
                    chunk.toString();


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


                    if (
                        !trimmed.startsWith("data:")
                    ) {
                        continue;
                    }


                    const data =
                        trimmed
                            .slice(5)
                            .trim();


                    if (data === "[DONE]") {
                        continue;
                    }


                    try {

                        const json =
                            JSON.parse(data);


                        const text =
                            json.choices?.[0]
                                ?.delta
                                ?.content || "";


                        if (text) {

                            fullReply += text;


                            res.write(
                                `data: ${JSON.stringify({
                                    text: text
                                })}\n\n`
                            );

                        }

                    } catch (error) {

                        // Ignore incomplete chunks

                    }

                }

            }
        );


        // ==================================
        // STREAM FINISHED
        // ==================================

        response.data.on(
            "end",
            () => {

                memory.conversation.push({

                    role: "assistant",

                    content:
                        fullReply ||
                        "MyAI se response nahi mila."

                });


                if (
                    memory.conversation.length > 60
                ) {

                    memory.conversation =
                        memory.conversation
                            .slice(-60);
                }


                saveMemory(memory);


                res.write(
                    `data: ${JSON.stringify({
                        done: true
                    })}\n\n`
                );


                res.end();

            }
        );


        // ==================================
        // STREAM ERROR
        // ==================================

        response.data.on(
            "error",
            (error) => {

                console.log(
                    "STREAM ERROR:",
                    error.message
                );


                if (!res.writableEnded) {

                    res.write(
                        `data: ${JSON.stringify({
                            error:
                                "Streaming error aa gaya."
                        })}\n\n`
                    );


                    res.end();
                }

            }
        );


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

const PORT = process.env.PORT || 3000;

app.listen(

    PORT,

    "0.0.0.0",

    () => {

        console.log(
            `MyAI Backend running on port ${PORT}`
        );

    }

);

