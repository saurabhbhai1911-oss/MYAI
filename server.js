const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

const memoryFile = path.join(__dirname, "memory.json");

// ================= MEMORY =================

function loadMemory() {
    try {
        if (fs.existsSync(memoryFile)) {
            return JSON.parse(fs.readFileSync(memoryFile, "utf8"));
        }
    } catch (error) {
        console.log("Memory read error:", error.message);
    }

    return {
        userName: "",
        founderName: "Saurabh",
        preferences: [],
        facts: [],
        importantInfo: [],
        conversation: []
    };
}

function saveMemory(memory) {
    try {
        fs.writeFileSync(
            memoryFile,
            JSON.stringify(memory, null, 2),
            "utf8"
        );
    } catch (error) {
        console.log("Memory save error:", error.message);
    }
}
async function loadUserMemory(userId, userSupabase) {
    const { data, error } = await userSupabase
        .from("user_memories")
        .select("memory")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        throw new Error("Private memory load failed: " + error.message);
    }

    if (data && data.memory) {
        return data.memory;
    }

    const defaultMemory = {
        userName: "",
        founderName: "Saurabh",
        preferences: [],
        facts: [],
        importantInfo: [],
        conversation: []
    };

    const { error: insertError } = await userSupabase
        .from("user_memories")
        .insert({
            user_id: userId,
            memory: defaultMemory
        });

    if (insertError) {
        throw new Error("Private memory create failed: " + insertError.message);
    }

    return defaultMemory;
}

async function saveUserMemory(userId, memory, userSupabase) {
    const { error } = await userSupabase
        .from("user_memories")
        .upsert({
            user_id: userId,
            memory: memory,
            updated_at: new Date().toISOString()
        }, {
            onConflict: "user_id"
        });

    if (error) {
        throw new Error("Private memory save failed: " + error.message);
    }
}

function needsWebSearch(message) {
    const text = message.toLowerCase().trim();

    const searchPatterns = [
        /\blatest news\b/,
        /\bcurrent news\b/,
        /\bnews today\b/,
        /\btoday's news\b/,
        /\bwhat happened\b/,
        /\brecent news\b/,
        /\blatest update\b/,
        /\bcurrent price\b/,
        /\bprice today\b/,
        /\bweather\b/,
        /\bforecast\b/,
        /\blive score\b/,
        /\bstock price\b/,
        /\bexchange rate\b/,
        /\bsearch the web\b/,
        /\bsearch the internet\b/,
        /\blook up\b/,
        /\bwho is\b.*\b(today|latest|currently|now)\b/,
        /\b(today|latest|currently|now)\b.*\b(news|price|update|score)\b/,
        /आज की खबर/,
        /ताजा खबर/,
        /ताज़ा खबर/,
        /आज का मौसम/,
        /मौसम कैसा/,
        /अभी का भाव/,
        /लेटेस्ट न्यूज़/,
        /ताज़ा समाचार/,
        /वेब पर खोज/,
        /इंटरनेट पर खोज/
    ];

    return searchPatterns.some(pattern => pattern.test(text));
}


// ================= WEB SEARCH CHECK =================


// ================= TAVILY SEARCH =================

async function searchTavily(query) {
    if (!TAVILY_API_KEY) {
        console.log("TAVILY_API_KEY missing");
        return "";
    }

    try {
        const response = await axios.post(
            "https://api.tavily.com/search",
            {
                api_key: TAVILY_API_KEY,
                query: query,
                search_depth: "basic",
                topic: "general",
                max_results: 5,
                include_answer: true,
                include_raw_content: false
            },
            {
                headers: {
                    "Content-Type": "application/json"
                },
                timeout: 10000
            }
        );

        const data = response.data;

        let webContext = "";

        if (data.answer) {
            webContext += `Tavily answer:\n${data.answer}\n\n`;
        }

        if (Array.isArray(data.results)) {
            webContext += "Web search results:\n";

            data.results.forEach((result, index) => {
                webContext += `
${index + 1}. ${result.title || ""}
URL: ${result.url || ""}
Content: ${result.content || ""}
`;
            });
        }

        return webContext;

    } catch (error) {
        console.log(
            "Tavily error:",
            error.response?.data || error.message
        );

        return "";
    }
}
// ================= SUPABASE PUBLIC CONFIG =================

app.get("/auth-config", (req, res) => {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        return res.status(500).json({
            error: "Supabase configuration is missing"
        });
    }

    res.json({
        url: SUPABASE_URL,
        publishableKey: SUPABASE_PUBLISHABLE_KEY
    });
});
// ================= HOME =================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// ================= STATUS =================

app.get("/status", (req, res) => {
    res.json({
        status: "online",
        message: "MyAI Backend is Running",
        openrouter: !!OPENROUTER_API_KEY,
        tavily: !!TAVILY_API_KEY
    });
});
// ================= SUPABASE AUTH =================

async function requireAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization || "";

        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Please login to use SaurAI."
            });
        }

        const token = authHeader.slice(7);

        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data.user) {
            return res.status(401).json({
                error: "Your session is invalid or expired. Please login again."
            });
        }

        req.user = data.user;
                 req.userSupabase = createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                },
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            }
        );        
        next();

    } catch (error) {
        console.log("Authentication error:", error.message);

        return res.status(401).json({
            error: "Authentication failed. Please login again."
        });
    }
}
// ================= CHAT =================

app.post("/chat", requireAuth, async (req, res) => {
    try {
        const userMessage = String(req.body.message || "").trim();

        if (!userMessage) {
            return res.status(400).json({
                error: "Message is required"
            });
        }

        if (!OPENROUTER_API_KEY) {
            return res.status(500).json({
                error: "OPENROUTER_API_KEY is missing"
            });
        }

        const memory = await loadUserMemory(req.user.id, req.userSupabase);
        // ---------- NAME MEMORY ----------

        const nameMatch = userMessage.match(
            /(?:my name is|mera naam|मेरा नाम)\s+([a-zA-Z][a-zA-Z ]{1,30})/i
        );

        if (nameMatch) {
            memory.userName = nameMatch[1].trim();
            await saveUserMemory(req.user.id, memory, req.userSupabase);
        }

        // ---------- CURRENT DATE/TIME ----------

        const currentDate = new Date().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            dateStyle: "full",
            timeStyle: "long"
        });

        // ---------- TAVILY ----------

        let webContext = "";

        if (needsWebSearch(userMessage)) {
            console.log("Tavily search:", userMessage);

            webContext = await searchTavily(userMessage);

            if (webContext) {
                console.log("Tavily search successful");
            } else {
                console.log("Tavily returned no results");
            }
        }

        // ---------- CONVERSATION MEMORY ----------

        memory.conversation = memory.conversation || [];

        memory.conversation.push({
            role: "user",
            content: userMessage
        });

        if (memory.conversation.length > 20) {
            memory.conversation =
                memory.conversation.slice(-20);
        }

         await saveUserMemory(req.user.id, memory, req.userSupabase);

        // ---------- SYSTEM PROMPT ----------

        let systemPrompt = `
You are SaurXai, a personal AI assistant.

Current Indian date and time:
${currentDate}

User name:
${memory.userName || "Unknown"}

Founder of SaurXai:
${memory.founderName || "Saurabh"}

Instructions:
- Answer naturally and helpfully.
- English input -> English response.
- Hindi input -> Hindi response.
- Roman Hindi/Hinglish input -> Roman Hindi/Hinglish response.
- Do not randomly change language.
- For study questions, explain simply.
- Do not invent facts.
- Use the current date/time above for date and time questions.
`;

        // ---------- WEB CONTEXT ----------

        if (webContext) {
            systemPrompt += `

IMPORTANT:
The following information was obtained from a live web search using Tavily.

Use it when answering the user's question.
Prefer the web information for current/latest facts.
Do not claim that you personally browsed the internet.
If the web results are uncertain or conflicting, clearly say so.

WEB SEARCH INFORMATION:
${webContext}
`;
        }

        const messages = [
            {
                role: "system",
                content: systemPrompt
            },
            ...memory.conversation
        ];

        // ---------- OPENROUTER ----------

        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "openrouter/free",
                messages: messages,
                temperature: 0.7,
                max_tokens: 1200
            },
            {
                headers: {
                    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://myai-2-wkxz.onrender.com",
                    "X-Title": "MyAI"
                },
                timeout: 30000
            }
        );

        const reply =
            response.data?.choices?.[0]?.message?.content ||
            "Sorry, mujhe abhi response nahi mila.";

        // ---------- SAVE AI RESPONSE ----------

        memory.conversation.push({
            role: "assistant",
            content: reply
        });

        if (memory.conversation.length > 20) {
            memory.conversation =
                memory.conversation.slice(-20);
        }

          await saveUserMemory(req.user.id, memory, req.userSupabase);
        res.json({
            reply: reply
        });

    } catch (error) {
        console.log(
            "Chat error:",
            error.response?.data || error.message
        );

        res.status(500).json({
            error:
                error.response?.data?.error?.message ||
                error.message ||
                "Something went wrong"
        });
    }
});

// ================= START SERVER =================

app.listen(PORT, "0.0.0.0", () => {
    console.log(`MyAI Backend running on port ${PORT}`);
});
