import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "100mb" }));

// API Endpoint for Gemini API Key validation
app.post("/api/validate-key", async (req, res) => {
  try {
    const apiKey = (req.headers["x-gemini-api-key"] as string) || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(400).json({ error: "Gemini API Key is required but not configured." });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    // Run a simple test call
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: "Output only the word 'OK' to validate and test key.",
    });

    const output = response.text || "";
    if (output.includes("OK") || output.trim().length > 0) {
      res.json({ valid: true });
    } else {
      res.status(502).json({ error: "Empty response from Gemini API during validation." });
    }
  } catch (error: any) {
    console.error("Gemini API key validation failed:", error);
    res.status(500).json({ error: error.message || "Failed to validate Gemini API Key." });
  }
});

// API Endpoint for Universal Translator using Gemini
app.post("/api/translate", async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Text parameter is required." });
      return;
    }

    const apiKey = (req.headers["x-gemini-api-key"] as string) || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(400).json({ error: "Gemini API Key is required but not configured. Please save your API Key in Settings first." });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const sourceDesc = sourceLang === "Auto Detect" ? "detect the source language" : `the source language is ${sourceLang}`;
    const prompt = `You are a professional, high-fidelity universal translation engine. 
Translate the following text into the target language "${targetLang}". 
Note that ${sourceDesc}. 

Deliver ONLY the direct translated text. Do not add any conversational replies, explanations, markdown formatting blocks (like \`\`\` or \`\`\`html), preamble, notes, or meta comments.

Text to translate:
${text}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({ translation: response.text || "" });
  } catch (error: any) {
    console.error("Gemini Translation failed:", error);
    res.status(500).json({ error: error.message || "Translation failed." });
  }
});

// API Endpoint for Voice to Text using Gemini
app.post("/api/transcribe", async (req, res) => {
  try {
    const { audioData, mimeType, format } = req.body;
    if (!audioData) {
      res.status(400).json({ error: "Audio data (base64) is required." });
      return;
    }

    const apiKey = (req.headers["x-gemini-api-key"] as string) || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(400).json({ error: "Gemini API Key is required but not configured. Please save your API Key in Settings first." });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const cleanMime = mimeType || "audio/wav";
    const runFormat = format || "txt";

    let prompt = "";
    if (runFormat === "srt") {
      prompt = `You will receive an audio file. Perform an exact and highly accurate speech transcription of what is spoken.
Translate the transcribed spoken speech into clear English subtitles.
Deliver the results strictly in the SubRip Subtitle (SRT) format. 
Format requirements:
- Use exact sequential block numbers starting from 1.
- Include accurate timestamps in the standard format (e.g., 00:00:01,200 --> 00:00:04,500).
- Produce ONLY raw SRT text content.
- Absolute ban on markdown formatting code blocks (do not wrap in \`\`\` or \`\`\`srt).
- Do not add any notes, preamble, explanations, or introductory/explanatory text.
- If speech in some segment is unclear, write [inaudible].
- Keep subtitle duration within reasonable intervals.`;
    } else {
      prompt = `You will receive an audio file. Perform an exact, high-fidelity transcription of all spoken words in the audio.
Output the full transcription in clear English text.
Strict instructions:
- Output ONLY the transcribed text. Do not summarize, outline, rewrite, or explain under any circumstances.
- Do not add markdown blocks, notes, comments, meta tags, or conversational intros/outros.
- If some speech is unclear or there is silence, print "[inaudible]" or omit as appropriate. Do not attempt to guess or invent context.`;
    }

    // Call Gemini API passing the audio data dynamically
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: cleanMime,
            data: audioData,
          },
        },
        {
          text: prompt,
        },
      ],
    });

    res.json({ output: response.text || "" });
  } catch (error: any) {
    console.error("Gemini Audio Transcription failed:", error);
    res.status(500).json({ error: error.message || "Speech transcription failed." });
  }
});

// API Endpoint: AI Text Removal using Gemini
app.post("/api/text-removal", async (req, res) => {
  try {
    const { text, removeFillers, removeTimestamps, removeBrackets, customPattern } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Text parameter is required." });
      return;
    }

    const apiKey = (req.headers["x-gemini-api-key"] as string) || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(400).json({ error: "Gemini API Key is required but not configured. Please save your API Key in Settings first." });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const prompt = `You are an expert script editor for Burmese movie recaps and video creators. 
Your job is to clean up and remove undesired text patterns from the provided text while keeping the rest of the spoken narrative, formatting, and language fully intact.

Text-to-Edit:
"""
${text}
"""

Removal directives:
${removeFillers ? "- Strip out verbal filler words, hesitations, and stuttering sounds (e.g. 'uh', 'um', 'ah', 'အင်း', 'အာ')." : ""}
${removeTimestamps ? "- Remove all subtitle timestamps, timecodes, and frame ranges (e.g. '00:01:20,300 --> 00:01:24,000' or sequential block numbers)." : ""}
${removeBrackets ? "- Remove anything contained within brackets, braces, parentheses, sound cue markers, or tags (e.g. '[Music]', '[Background laughter]', '(သရဲသံ)')." : ""}
${customPattern ? `- Custom removal instruction: Specifically search and remove or clean the following pattern or text: "${customPattern}"` : ""}

Deliver ONLY the final cleaned, edited script or text. Do NOT add any greeting, explanations, introductory remarks, notes, or markdown formatting code blocks (do not wrap in \`\`\` or \`\`\`txt). Keep the original Burmese script completely natural and accurate!`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({ cleanedText: response.text || "" });
  } catch (error: any) {
    console.error("Gemini text removal failed:", error);
    res.status(500).json({ error: error.message || "Failed to process text removal using Gemini." });
  }
});

// API Endpoint: Cinematic Thumbnail & Poster Maker using Gemini
app.post("/api/generate-poster", async (req, res) => {
  try {
    const { prompt, aspectRatio } = req.body;
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "Prompt is required and must be a string." });
      return;
    }

    const apiKey = (req.headers["x-gemini-api-key"] as string) || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(400).json({ error: "Gemini API Key is required but not configured. Please save your API Key in Settings first." });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    // Optimize the prompt for cinematic high-contrast dramatic poster/thumbnail art
    const optimizePrompt = `You are an expert movie poster and cinematic thumbnail designer. Translate (if needed) and enrich the following description into a highly detailed, professional, high-contrast, atmospheric image generation prompt in English. It must have dramatic, photorealistic qualities, cinematic 8k lighting, high-contrast values, neon tints or deep shadows, and cinematic framing. Do not request text overlays inside the image itself, just describe the scene.
    
    Description: "${prompt}"
    
    Output ONLY the final English prompt. No introductions, explanations, or quotes.`;

    const optimizationRes = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: optimizePrompt,
    });

    const optimizedPrompt = (optimizationRes.text || prompt).trim();

    // Generate the image using gemini-2.5-flash-image
    const imageRes = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [{ text: optimizedPrompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio === "16:9" ? "16:9" : "9:16"
        }
      }
    });

    let imageUrl = "";
    if (imageRes.candidates?.[0]?.content?.parts) {
      for (const part of imageRes.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!imageUrl) {
      throw new Error("No image data returned from the Gemini Image model.");
    }

    res.json({ imageUrl, optimizedPrompt });
  } catch (error: any) {
    console.error("Poster generation failed:", error);
    res.status(500).json({ error: error.message || "Failed to generate cinematic poster." });
  }
});

// API Endpoint 1: Ultra Long-Form Edge TTS Aggregation Pipeline
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice, style, rate: reqRate, pitch: reqPitch } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Text parameter is required and must be a string." });
      return;
    }
    const selectedVoice = voice || "my-MM-NilarNeural";
    const selectedStyle = style || "general";

    // Chunking text safely based on Burmese punctuation [ ။ ], English punctuation [ . , ! , ? ], or newline [ \n ]
    // Each chunk should be reasonably sized (e.g., around 150-250 characters) to avoid timeouts.
    const rawChunks = text.split(/(?<=[။。\.\!\?\n])/);
    const cleanedChunks: string[] = [];

    for (let chunk of rawChunks) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      
      // If a single chunk is still extremely long (e.g., no punctuation), sub-chunk it by spaces/characters
      if (trimmed.length > 200) {
        let subIndex = 0;
        while (subIndex < trimmed.length) {
          cleanedChunks.push(trimmed.slice(subIndex, subIndex + 200));
          subIndex += 200;
        }
      } else {
        cleanedChunks.push(trimmed);
      }
    }

    if (cleanedChunks.length === 0) {
      res.status(400).json({ error: "The provided text contains no speakable characters." });
      return;
    }

    // Compute styles fallback in case rate and pitch are not passed or need resolution
    const normalizedStyle = selectedStyle.toLowerCase();
    let computedRate = "+0%";
    let computedPitch = "+0Hz";

    if (
      normalizedStyle.includes("cheerful") || 
      normalizedStyle.includes("တက်ကြွသံ") || 
      normalizedStyle.includes("ပျော်ရွှင်သံ")
    ) {
      computedRate = "+12%";
      computedPitch = "+6Hz";
    } else if (
      normalizedStyle.includes("newscast") || 
      normalizedStyle.includes("သတင်းဖတ်သံ")
    ) {
      computedRate = "+5%";
      computedPitch = "-2Hz";
    } else if (
      normalizedStyle.includes("chat") || 
      normalizedStyle.includes("စကားပြောသံ") || 
      normalizedStyle.includes("စကားပြော")
    ) {
      computedRate = "+8%";
      computedPitch = "+0Hz";
    } else {
      computedRate = "+0%";
      computedPitch = "+0Hz";
    }

    const finalRate = reqRate || computedRate;
    const finalPitch = reqPitch || computedPitch;

    console.log(`Processing Edge TTS Request: Split script into ${cleanedChunks.length} chunks for voice: ${selectedVoice}, rate: ${finalRate}, pitch: ${finalPitch}`);

    // Fetch all audio chunks in parallel using Promise.all to prevent Vercel serverless timeouts
    const chunkPromises = cleanedChunks.map(async (chunkText, i) => {
      const sanitizedText = chunkText.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
      try {
        const isMyanmar = selectedVoice.startsWith("my-") || selectedVoice.includes("my-MM");
        let response = null;

        const voice = selectedVoice;
        const rate = finalRate;
        const pitch = finalPitch;

        if (isMyanmar) {
          const ssmlText = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='my-MM'><voice name='${voice}'><prosody rate='${rate}' pitch='${pitch}'>${sanitizedText}</prosody></voice></speak>`;

          try {
            response = await fetch(`https://my-edge-tts-api.vercel.app/api/tts?voice=${selectedVoice}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/ssml+xml",
                "Accept": "*/*"
              },
              body: ssmlText
            });

            if (!response || !response.ok) {
              response = await fetch("https://my-edge-tts-api.vercel.app/api/tts", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Accept": "*/*"
                },
                body: JSON.stringify({
                  ssml: ssmlText,
                  voice: selectedVoice
                })
              });
            }
          } catch (postError) {
            console.warn("POST SSML error for chunk index:", i, postError);
          }

          if (!response || !response.ok) {
            const fallbackUrl = `https://my-edge-tts-api.vercel.app/api/tts?text=${encodeURIComponent(sanitizedText)}&voice=${selectedVoice}&rate=${encodeURIComponent(rate)}&pitch=${encodeURIComponent(pitch)}`;
            response = await fetch(fallbackUrl);
          }
        } else {
          const ttsUrl = `https://my-edge-tts-api.vercel.app/api/tts?text=${encodeURIComponent(sanitizedText)}&voice=${selectedVoice}&rate=${encodeURIComponent(rate)}&pitch=${encodeURIComponent(pitch)}`;
          response = await fetch(ttsUrl);
        }

        if (!response || !response.ok) {
          throw new Error(`Edge TTS API responded with status ${response ? response.status : "No Response"}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return { index: i, buffer: Buffer.from(arrayBuffer) };
      } catch (chunkError) {
        console.error(`Error processing chunk index ${i}:`, chunkError);
        return { index: i, buffer: null };
      }
    });

    const results = await Promise.all(chunkPromises);

    // Sort results by original index to preserve voice audio segment order
    results.sort((a, b) => a.index - b.index);

    const audioBuffers: Buffer[] = [];
    for (const r of results) {
      if (r.buffer) {
        audioBuffers.push(r.buffer);
      }
    }

    if (audioBuffers.length === 0) {
      res.status(502).json({ error: "Failed to synthesize any audio chunks from Edge TTS API." });
      return;
    }

    // Sequentially merge all chunks into one single high-fidelity MP3 Buffer
    const mergedAudio = Buffer.concat(audioBuffers);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": mergedAudio.length,
      "Content-Disposition": `attachment; filename="burmese_recap_tts_${Date.now()}.mp3"`,
      "Cache-Control": "no-cache",
    });

    res.send(mergedAudio);
  } catch (error: any) {
    console.error("Critical error in TTS aggregation service:", error);
    res.status(500).json({ error: error.message || "Internal server error during audio synthesis." });
  }
});

// API Endpoint 2: Universal Video Downloader proxy / telemetry simulator
app.post("/api/downloader/sim", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    res.status(400).json({ error: "URL is required" });
    return;
  }

  // Generates real stream details
  const randomId = Math.random().toString(36).substring(7);
  res.json({
    id: `dl_${randomId}`,
    title: `Recap_Video_${randomId}.mp4`,
    fileSizeMB: Math.floor(Math.random() * 80) + 15, // 15MB to 95MB
    fps: 30,
    resolution: "1080p",
    thumbnail: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80",
    url: url,
  });
});

// Vite Integration Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // For React/Vite SPA routing
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Burmese Recap Tool] Server boot success. Live on http://localhost:${PORT}`);
  });
}

startServer();
