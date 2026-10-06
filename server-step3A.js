const express = require("express");
const cors = require("cors");
const fs = require("fs");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   MEMORY
========================= */

let myMemory = {
    userName: "",
    founderName: ""
};

try {
    if (fs.existsSync("memory.json")) {
        const savedMemory = fs.readFileSync("memory.json", "utf8");
        myMemory = JSON.parse(savedMemory);
    }
} catch (error) {
    console.log("Memory file could not be loaded.");
}

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
    res.send("MyAI Backend is Running ✅");
});

/* =========================
   DATE / DAY
========================= */

function getTodayInfo() {
    const now = new Date();

    return {
        date: now.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Kolkata"
        }),

        day: now.toLocaleDateString("en-IN", {
            weekday: "long",
            timeZone: "Asia/Kolkata"
        })
    };
}

/* =========================
   DATE TO DAY
========================= */

function getDayFromDate(text) {

    const match = text.match(
        /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
    );

    if (!match) return null;

    const months = {
        january: 0,
        february: 1,
        march: 2,
        april: 3,
        may: 4,
        june: 5,
        july: 6,
        august: 7,
        september: 8,
        october: 9,
        november: 10,
        december: 11
    };

    const date = new Date(
        Date.UTC(
            Number(match[3]),
            months[match[2].toLowerCase()],
            Number(match[1])
        )
    );

    if (isNaN(date.getTime())) {
        return null;
    }

    return date.toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "UTC"
    });
}

/* =========================
   CALCULATOR
========================= */

function calculateMath(text) {

    let expression = text
        .replace(/what is|calculate|solve|answer|equals/gi, "")
        .replace(/=/g, "")
        .trim();

    if (!expression) {
        return null;
    }

    if (!/^[0-9+\-*/().%\s]+$/.test(expression)) {
        return null;
    }

    try {

        const result = Function(
            '"use strict"; return (' + expression + ")"
        )();

        if (
            typeof result === "number" &&
            Number.isFinite(result)
        ) {
            return result;
        }

    } catch (error) {
        return null;
    }

    return null;
}

/* =========================
   WIKIPEDIA WEB SEARCH
========================= */

async function searchWikipedia(query) {

    try {

        const searchUrl =
            "https://en.wikipedia.org/w/api.php" +
            "?action=query" +
            "&list=search" +
            "&srsearch=" +
            encodeURIComponent(query) +
            "&srlimit=3" +
            "&format=json" +
            "&origin=*";

        const searchResponse = await fetch(searchUrl);

        if (!searchResponse.ok) {
            return null;
        }

        const searchData = await searchResponse.json();

        const results =
            searchData?.query?.search;

        if (!results || results.length === 0) {
            return null;
        }

        const titles = results
            .slice(0, 3)
            .map(item => item.title);

        const pageUrl =
            "https://en.wikipedia.org/w/api.php" +
            "?action=query" +
            "&prop=extracts" +
            "&exintro=1" +
            "&explaintext=1" +
            "&redirects=1" +
            "&titles=" +
            encodeURIComponent(titles[0]) +
            "&format=json" +
            "&origin=*";

        const pageResponse =
            await fetch(pageUrl);

        if (!pageResponse.ok) {
            return null;
        }

        const pageData =
            await pageResponse.json();

        const pages =
            pageData?.query?.pages;

        if (!pages) {
            return null;
        }

        const page =
            Object.values(pages)[0];

        if (!page || !page.extract) {
            return null;
        }

        return {
            title: page.title,
            extract: page.extract.substring(0, 5000),
            url:
                "https://en.wikipedia.org/wiki/" +
                encodeURIComponent(
                    page.title.replace(/ /g, "_")
                )
        };

    } catch (error) {

        console.log(
            "Wikipedia search error:",
            error.message
        );

        return null;
    }
}

/* =========================
   SHOULD SEARCH WEB?
========================= */

function needsWebSearch(text) {

    const lower = text.toLowerCase();

    const keywords = [
        "search",
        "find",
        "wikipedia",
        "who is",
        "what is",
        "tell me about",
        "explain",
        "history of",
        "biography of",
        "information about"
    ];

    return keywords.some(
        word => lower.includes(word)
    );
}

/* =========================
   CHAT API
========================= */

app.post("/api/chat", async (req, res) => {

    try {

        const {
            message,
            history,
            userName,
            language
        } = req.body;

        if (!message || !message.trim()) {

            return res.status(400).json({
                error: "Message is required"
            });

        }

        const userMessage =
            message.trim();

        /* DATE CHECK */

        const requestedDay =
            getDayFromDate(userMessage);

        if (requestedDay) {

            return res.json({
                reply:
                    `${userMessage} was ${requestedDay}.`
            });

        }

        /* TODAY CHECK */

        if (
            /today|aaj|आज/i.test(userMessage) &&
            /date|day|din|दिन|तारीख/i.test(userMessage)
        ) {

            const today =
                getTodayInfo();

            return res.json({
                reply:
                    `Today is ${today.day}, ${today.date}.`
            });

        }

        /* CALCULATOR */

        const mathResult =
            calculateMath(userMessage);

        if (mathResult !== null) {

            return res.json({
                reply:
                    `The answer is ${mathResult}.`
            });

        }

        /* =========================
           CONVERSATION HISTORY
        ========================= */

        let previousMessages = [];

        if (Array.isArray(history)) {

            previousMessages =
                history
                    .filter(item =>
                        item &&
                        (
                            item.role === "user" ||
                            item.role === "assistant"
                        ) &&
                        typeof item.content === "string"
                    )
                    .slice(-10);
        }

        /* =========================
           MEMORY
        ========================= */

        const savedUserName =
            userName ||
            myMemory.userName ||
            "";

        const founderName =
            myMemory.founderName ||
            "Saurabh";

        /* =========================
           LANGUAGE
        ========================= */

        let languageInstruction;

        if (language === "hindi") {

            languageInstruction = `
LANGUAGE RULE:

Reply in simple natural Hindi.

Use Devanagari Hindi.

Do not randomly switch to English.

Use English only for necessary technical terms
or when the user specifically asks for English.
`;

        } else {

            languageInstruction = `
LANGUAGE RULE:

Match the user's language.

If the user writes English,
reply in natural English.

If the user writes Hindi or Hinglish
using Roman letters,
reply in natural Hinglish using Roman letters.

Do not randomly switch languages.
`;
        }

        /* =========================
           MEMORY INSTRUCTION
        ========================= */

        const memoryInstruction = `
MYAI MEMORY:

User name:
${savedUserName || "Not provided"}

Founder name:
${founderName}

FOUNDER RULE:

If the user asks:

"Who created you?"
"Tumhe kisne banaya?"
"Who is your founder?"
"Tumhara founder kaun hai?"

Answer:

"I was created by ${founderName}."

or naturally in the user's language:

"Mujhe ${founderName} ne banaya hai."

USER NAME RULE:

If the user asks:

"What is my name?"
"Mera naam kya hai?"
"मेरा नाम क्या है?"

and the saved user name is available,

answer:

"Your name is ${savedUserName}."

Do not confuse the founder's name
with the user's name.
`;

        /* =========================
           TODAY
        ========================= */

        const today =
            getTodayInfo();

        /* =========================
           WEB INFORMATION
        ========================= */

        let webContext = "";

        if (needsWebSearch(userMessage)) {

            const webResult =
                await searchWikipedia(userMessage);

            if (webResult) {

                webContext = `
WEB INFORMATION FROM WIKIPEDIA:

Title:
${webResult.title}

Information:
${webResult.extract}

Source:
${webResult.url}

IMPORTANT:
Use this information only when relevant.
Do not claim that Wikipedia information is
real-time news.
If the user asks for breaking/latest news,
say that this version of MyAI does not yet
have full live-news search.
`;
            }
        }

        /* =========================
           SYSTEM PROMPT
        ========================= */

        const systemPrompt = `
You are MyAI.

You are the AI assistant created for the MyAI project.

IDENTITY:

- Your name is MyAI.
- You are MyAI.
- Never say you are Liquid AI.
- Never say you are LFM.
- Never say you are ChatGPT.
- Never identify yourself as the underlying model.
- Never invent another founder or company.

CURRENT DATE:

${today.date}

CURRENT DAY:

${today.day}

${memoryInstruction}

${languageInstruction}

${webContext}

ACCURACY:

- Never knowingly give false information.
- Do not invent facts.
- If unsure, say you are unsure.
- Use relevant conversation history.
- If web information is provided, use it carefully.
- Do not pretend Wikipedia is live news.

STYLE:

- Be friendly.
- Be helpful.
- Keep simple questions concise.
- Give detailed explanations when requested.
- Explain difficult things in simple words.
`;

        /* =========================
           MESSAGES
        ========================= */

        const messages = [

            {
                role: "system",
                content: systemPrompt
            },

            ...previousMessages,

            {
                role: "user",
                content: userMessage
            }

        ];

        /* =========================
           OPENROUTER
        ========================= */

        const response =
            await fetch(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                    method: "POST",

                    headers: {

                        "Authorization":
                            `Bearer ${process.env.OPENROUTER_API_KEY}`,

                        "Content-Type":
                            "application/json",

                        "HTTP-Referer":
                            "http://localhost:3000",

                        "X-Title":
                            "MyAI"
                    },

                    body: JSON.stringify({

                        model:
                            "openrouter/free",

                        temperature:
                            0.3,

                        messages:
                            messages

                    })
                }
            );

        const data =
            await response.json();

        /* =========================
           OPENROUTER ERROR
        ========================= */

        if (!response.ok) {

            console.log(
                "OpenRouter Error:",
                data
            );

            return res.status(500).json({
                error:
                    "AI service error"
            });
        }

        /* =========================
           AI REPLY
        ========================= */

        const reply =
            data?.choices?.[0]?.message?.content;

        if (!reply) {

            return res.status(500).json({
                error:
                    "AI returned an empty response."
            });

        }

        /* =========================
           SEND RESPONSE
        ========================= */

        res.json({

            reply:
                reply.trim(),

            webUsed:
                Boolean(webContext)

        });

    } catch (error) {

        console.error(
            "MyAI Server Error:",
            error
        );

        res.status(500).json({

            error:
                "Something went wrong.",

            details:
                error.message

        });

    }

});

/* =========================
   START SERVER
========================= */

app.listen(
    3000,
    "0.0.0.0",
    () => {

        console.log(
            "MyAI Backend running on http://127.0.0.1:3000"
        );

    }
);
