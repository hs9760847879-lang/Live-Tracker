const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors({
    origin: ['https://commission-team-tracker.vercel.app', 'http://localhost:3000']
}));
app.use(express.json());
// Serve the local dashboard directly
app.use(express.static(__dirname));

const API_KEYS = [
    'AIzaSyAfrL6OLF2SNAOXVy9rTgblshXVIyGne10',
    'AIzaSyAKQn_gAs36-eE778GI7pU1HJCrRVUr7W8',
    'AIzaSyBhcqNlu6TBNW5Ql-9vl5-DqHKTXm681j0',
    'AIzaSyBAckiqll9cvZFcGYOxdgr6udv1ZxtUyqo'
];

const MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.5-flash-lite'
];

// Simple memory cache
const insightCache = new Map();

app.post('/api/ai-insights', async (req, res) => {
    const { kpiType, kpiKey, dateRange, aggregatedData } = req.body;

    // Include kpiKey to prevent cross-KPI cache hits
    const cacheKey = `${kpiKey || kpiType}_${dateRange}`;
    if (insightCache.has(cacheKey)) {
        return res.json(insightCache.get(cacheKey));
    }

    const systemPrompt = `You are a data analyst. You will receive KPI data as an array of objects with "date" (YYYY-MM-DD) and "value" (number) fields.
Analyze the data and respond in strict JSON format with these exact fields:
{
  "peak_day": "YYYY-MM-DD of the day with the highest value",
  "drop_day": "YYYY-MM-DD of the day with the lowest value",
  "summary": "1-2 sentence business insight about the trend",
  "confidence": "High" or "Medium" or "Low"
}
Important: Always extract the actual dates from the data. Never return null for peak_day or drop_day.`;
    const formattedData = Array.isArray(aggregatedData) ? aggregatedData.map(d => `${d.date}: ${d.value}`).join('\n') : 'No data';
    const userPrompt = `KPI: ${kpiType}\nPeriod: ${dateRange}\nDaily values:\n${formattedData}`;

    const tryModel = async (model, keyIndex) => {
        const key = API_KEYS[keyIndex];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: systemPrompt + "\nData: " + userPrompt }] }],
                    generationConfig: { response_mime_type: "application/json" }
                })
            });

            if (resp.status === 429 || resp.status >= 500) {
                throw new Error(`Retryable error: ${resp.status}`);
            }
            if (!resp.ok) {
                const err = await resp.text();
                throw new Error(`Non-retryable error: ${resp.status} - ${err}`);
            }

            const data = await resp.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!textResponse) throw new Error("Invalid response structure");

            try {
                const parsed = JSON.parse(textResponse);
                // Validate and fill in missing fields
                if (!parsed.peak_day || !parsed.drop_day) {
                    let max = -Infinity, min = Infinity, peak = '', drop = '';
                    if (Array.isArray(aggregatedData)) {
                        aggregatedData.forEach(d => {
                            if (d.value > max) { max = d.value; peak = d.date; }
                            if (d.value < min) { min = d.value; drop = d.date; }
                        });
                    }
                    parsed.peak_day = parsed.peak_day || peak || 'N/A';
                    parsed.drop_day = parsed.drop_day || drop || 'N/A';
                }
                parsed.summary = parsed.summary || 'Performance analysis complete.';
                parsed.confidence = parsed.confidence || 'Low';
                return parsed;
            } catch (e) {
                throw new Error("Invalid JSON from AI");
            }
        } catch (error) {
            throw error;
        }
    };

    let result = null;
    let found = false;

    // Retry loop
    for (const model of MODELS) {
        if (found) break;
        for (let i = 0; i < API_KEYS.length; i++) {
            try {
                result = await tryModel(model, i);
                found = true;
                break;
            } catch (err) {
                console.error(`Failed ${model} with Key ${i+1}: ${err.message}`);
                // Try next key or model
            }
        }
    }

    if (found && result) {
        insightCache.set(cacheKey, result);
        return res.json(result);
    }

    // Final Fallback
    console.log("All AI calls failed. Generating local fallback.");
    let peak_day = "";
    let drop_day = "";
    let max = -Infinity;
    let min = Infinity;

    if (aggregatedData && Array.isArray(aggregatedData)) {
        aggregatedData.forEach(d => {
            if (d.value > max) { max = d.value; peak_day = d.date; }
            if (d.value < min) { min = d.value; drop_day = d.date; }
        });
    }

    const fallbackResponse = {
        peak_day: peak_day || "N/A",
        drop_day: drop_day || "N/A",
        summary: `Performance peaked on ${peak_day} and dropped on ${drop_day}. Displaying fallback insights due to AI service unavailability.`,
        confidence: "Low"
    };

    return res.json(fallbackResponse);
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
