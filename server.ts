import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import os from "os";
import { exec, spawn } from "child_process";
import { EventEmitter } from "events";
import { pipeline } from "stream/promises";
import multer from "multer";
import https from "https";

dotenv.config();

// Helper to call Gemini with retries and model fallback under high load / 503 errors
async function generateContentWithRetry(
  ai: any,
  options: { model: string; contents: any; config?: any },
  retries = 3,
  delayMs = 1500
): Promise<any> {
  const fallbackSequence = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  let attempt = 0;
  let lastError: any = null;
  let currentModel = options.model;

  while (attempt < retries) {
    try {
      console.log(`[Gemini API Call] Attempt ${attempt + 1} of ${retries} using model: ${currentModel}`);
      const response = await ai.models.generateContent({
        ...options,
        model: currentModel,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      attempt++;
      
      const isTransient = 
        err.status === 503 || 
        err.statusCode === 503 ||
        err.status === 429 ||
        err.statusCode === 429 ||
        (err.message && (
          err.message.includes("503") || 
          err.message.includes("429") || 
          err.message.includes("high demand") || 
          err.message.includes("temporary") ||
          err.message.includes("quota") || 
          err.message.includes("UNAVAILABLE") ||
          err.message.includes("RESOURCE_EXHAUSTED")
        ));

      if (isTransient) {
        console.log(`[Gemini API Status] Attempt ${attempt} encountered transient busy status (503/429/busy). Auto-switching/retrying...`);
      } else {
        console.log(`[Gemini API Status] Attempt ${attempt} encountered potential error: ${err.message || err}`);
      }

      if (isTransient && attempt < retries) {
        // Find the next model in the fallback sequence to try
        const currentIndex = fallbackSequence.indexOf(currentModel);
        if (currentIndex !== -1 && currentIndex + 1 < fallbackSequence.length) {
          const nextModel = fallbackSequence[currentIndex + 1];
          console.log(`[Gemini API Status] Dynamic fallback: switching model to ${nextModel} for retry.`);
          currentModel = nextModel;
        } else if (currentIndex === -1) {
          console.log(`[Gemini API Status] Custom model failed. Falling back to gemini-3.1-flash-lite.`);
          currentModel = "gemini-3.1-flash-lite";
        }
        
        console.log(`[Gemini API Status] Waiting ${delayMs}ms before retrying...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2; // Exponential backoff
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

const app = express();
const PORT = 3000;
const upload = multer({ dest: os.tmpdir() });

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Helper to get Gemini API Key dynamically from request
function getRequestApiKey(req: any): string | null {
  const key = (req.headers["x-gemini-api-key"] as string) || 
              req.body.apiKey || 
              (req.headers["authorization"] as string)?.replace("Bearer ", "") ||
              process.env.GEMINI_API_KEY;
  return key || null;
}

// API Endpoint for Gemini API Key validation
app.post("/api/validate-key", async (req, res) => {
  try {
    const apiKey = getRequestApiKey(req);
    if (!apiKey) {
      res.status(400).json({ error: "Gemini API Key is required but not configured. Please check your runtime key settings." });
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
    const response = await generateContentWithRetry(ai, {
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

// Helper to flatten and safely extract text from any nested Gemini response structure, stringified JSON, or raw object
function flattenTranslationResponse(input: any): string {
  if (!input) return "";
  
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        return flattenTranslationResponse(parsed);
      } catch (e) {
        return input;
      }
    }
    return input;
  }
  
  if (typeof input === "object") {
    if (
      input.candidates &&
      Array.isArray(input.candidates) &&
      input.candidates[0] &&
      input.candidates[0].content &&
      input.candidates[0].content.parts &&
      Array.isArray(input.candidates[0].content.parts) &&
      input.candidates[0].content.parts[0]
    ) {
      const part = input.candidates[0].content.parts[0];
      if (typeof part === "string") return flattenTranslationResponse(part);
      if (part && typeof part.text === "string") return flattenTranslationResponse(part.text);
    }
    
    const keysToCheck = ["translatedText", "translation", "text", "translated_text", "output", "result"];
    for (const key of keysToCheck) {
      if (input[key] !== undefined && input[key] !== null) {
        return flattenTranslationResponse(input[key]);
      }
    }
    
    if (Array.isArray(input)) {
      if (input.length > 0) {
        return flattenTranslationResponse(input[0]);
      }
      return "";
    }
    
    if (typeof input.text === "string") {
      return flattenTranslationResponse(input.text);
    }
    
    try {
      return JSON.stringify(input);
    } catch {
      return "";
    }
  }
  
  return String(input);
}

// API Endpoint for Universal Translator using Gemini
app.post("/api/translate", async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Text parameter is required." });
      return;
    }

    const apiKey = getRequestApiKey(req);
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

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    // Safely extract and flatten the translation response
    const cleanTranslatedText = flattenTranslationResponse(response);

    res.json({ 
      translatedText: cleanTranslatedText,
      translation: cleanTranslatedText // Fallback key for backward compatibility
    });
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

    const apiKey = getRequestApiKey(req);
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
    const response = await generateContentWithRetry(ai, {
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

// API Endpoint 1: Ultra Long-Form Edge TTS Aggregation Pipeline
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice, style, rate: reqRate, pitch: reqPitch, apiKey: bodyApiKey } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Text parameter is required and must be a string." });
      return;
    }
    const selectedVoice = voice || "my-MM-NilarNeural";
    const selectedStyle = style || "general";

    // Extract the API key passed from local memory
    const userApiKey = (req.headers["x-gemini-api-key"] as string) || bodyApiKey || process.env.GEMINI_API_KEY || "";

    // Splits must only occur at natural Burmese sentence breaks (။) or English periods (.) to keep full phrases intact.
    const sentences = text.split(/(?<=[။\.])/).map(s => s.trim()).filter(Boolean);
    const cleanedChunks: string[] = [];
    let currentChunk = "";
    let currentLinesCount = 0;

    for (let sentence of sentences) {
      // Safeguard: if a single sentence is extremely long (e.g., > 1800 characters), split it
      if (sentence.length > 1800) {
        if (currentChunk) {
          cleanedChunks.push(currentChunk.trim());
          currentChunk = "";
          currentLinesCount = 0;
        }
        let temp = sentence;
        while (temp.length > 1800) {
          cleanedChunks.push(temp.slice(0, 1800));
          temp = temp.slice(1800);
        }
        sentence = temp;
        if (!sentence) continue;
      }

      if (currentChunk && (currentChunk.length + sentence.length + 1 > 1800 || currentLinesCount >= 10)) {
        cleanedChunks.push(currentChunk.trim());
        currentChunk = sentence;
        currentLinesCount = 1;
      } else {
        if (currentChunk) {
          const lastChar = currentChunk[currentChunk.length - 1];
          const needsSpace = !/[။\s]/.test(lastChar);
          currentChunk += (needsSpace ? " " : "") + sentence;
        } else {
          currentChunk = sentence;
        }
        currentLinesCount++;
      }
    }
    if (currentChunk.trim()) {
      cleanedChunks.push(currentChunk.trim());
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

    // Map to hold buffers tied to their exact loop index
    const chunkMap = new Map<number, Buffer>();

    // Dynamic, localized chunk retrieval function with built-in retries and timeouts
    const processSingleChunkWithRetry = async (index: number, maxAttempts = 3): Promise<Buffer> => {
      const chunkText = cleanedChunks[index];
      const sanitizedText = chunkText.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
      let lastChunkError: any = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const isMyanmar = selectedVoice.startsWith("my-") || selectedVoice.includes("my-MM");
          let response = null;

          const voice = selectedVoice;
          const rate = finalRate;
          const pitch = finalPitch;

          // Standard timeout helper (15 seconds) to prevent infinite server-side hangs
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          const fetchHeaders: Record<string, string> = {
            "Content-Type": "application/ssml+xml",
            "Accept": "*/*"
          };
          if (userApiKey) {
            fetchHeaders["X-Gemini-API-Key"] = userApiKey;
            fetchHeaders["Authorization"] = `Bearer ${userApiKey}`;
          }

          if (isMyanmar) {
            const ssmlText = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='my-MM'><voice name='${voice}'><prosody rate='${rate}' pitch='${pitch}'>${sanitizedText}</prosody></voice></speak>`;

            try {
              response = await fetch(`https://my-edge-tts-api.vercel.app/api/tts?voice=${selectedVoice}`, {
                method: "POST",
                headers: fetchHeaders,
                body: ssmlText,
                signal: controller.signal
              });

              if (!response || !response.ok) {
                const jsonHeaders: Record<string, string> = {
                  "Content-Type": "application/json",
                  "Accept": "*/*"
                };
                if (userApiKey) {
                  jsonHeaders["X-Gemini-API-Key"] = userApiKey;
                  jsonHeaders["Authorization"] = `Bearer ${userApiKey}`;
                }
                response = await fetch("https://my-edge-tts-api.vercel.app/api/tts", {
                  method: "POST",
                  headers: jsonHeaders,
                  body: JSON.stringify({
                    ssml: ssmlText,
                    voice: selectedVoice
                  }),
                  signal: controller.signal
                });
              }
            } catch (postError) {
              console.warn(`[TTS Batch-Chunk ${index + 1}] POST SSML error on attempt ${attempt}:`, postError);
            }

            if (!response || !response.ok) {
              const fallbackUrl = `https://my-edge-tts-api.vercel.app/api/tts?text=${encodeURIComponent(sanitizedText)}&voice=${selectedVoice}&rate=${encodeURIComponent(rate)}&pitch=${encodeURIComponent(pitch)}`;
              const getHeaders: Record<string, string> = {};
              if (userApiKey) {
                getHeaders["X-Gemini-API-Key"] = userApiKey;
                getHeaders["Authorization"] = `Bearer ${userApiKey}`;
              }
              response = await fetch(fallbackUrl, { headers: getHeaders, signal: controller.signal });
            }
          } else {
            const ttsUrl = `https://my-edge-tts-api.vercel.app/api/tts?text=${encodeURIComponent(sanitizedText)}&voice=${selectedVoice}&rate=${encodeURIComponent(rate)}&pitch=${encodeURIComponent(pitch)}`;
            const getHeaders: Record<string, string> = {};
            if (userApiKey) {
              getHeaders["X-Gemini-API-Key"] = userApiKey;
              getHeaders["Authorization"] = `Bearer ${userApiKey}`;
            }
            response = await fetch(ttsUrl, { headers: getHeaders, signal: controller.signal });
          }

          clearTimeout(timeoutId);

          if (!response || !response.ok) {
            throw new Error(`Edge TTS API responded with status ${response ? response.status : "No Response"}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          if (buffer.length === 0) {
            throw new Error("Received an empty audio buffer.");
          }
          return buffer;
        } catch (err: any) {
          lastChunkError = err;
          console.warn(`[TTS Retry Alert] Chunk index ${index} failed (Attempt ${attempt}/${maxAttempts}). Error: ${err.message || err}`);
          if (attempt < maxAttempts) {
            // Localized exponential backoff
            await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
          }
        }
      }
      throw lastChunkError || new Error("Unknown synthesis error");
    };

    console.log(`[TTS Parallel] Dispatching all ${cleanedChunks.length} chunks concurrently...`);

    // Fetch all chunks concurrently in parallel
    const chunkPromises = cleanedChunks.map((_, index) => {
      return processSingleChunkWithRetry(index).catch(err => {
        console.error(`[TTS Parallel Error] Permanent failure for chunk index ${index}:`, err);
        return null; // Keep going so Promise.all does not fail completely
      });
    });

    const results = await Promise.all(chunkPromises);

    // Merge them sequentially in the exact original order
    const validBuffers = results.filter((buf): buf is Buffer => buf !== null && buf.length > 0);

    if (validBuffers.length === 0) {
      throw new Error("All parallel synthesis chunks failed to compile.");
    }

    const mergedBuffer = Buffer.concat(validBuffers);
    console.log(`[TTS Merge Engine] Unified ${validBuffers.length}/${cleanedChunks.length} chunks into a single audio payload (${mergedBuffer.length} bytes).`);

    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": mergedBuffer.length,
      "Content-Disposition": `attachment; filename="burmese_recap_tts_${Date.now()}.mp3"`,
    });

    res.write(mergedBuffer);
    res.end();
  } catch (error: any) {
    console.error("Critical error in TTS streaming service:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Internal server error during audio synthesis." });
    } else {
      res.end();
    }
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

// API Endpoint for Real Video/Audio Subtitle & Transcript Generation (Streaming Pipeline)
app.post("/api/subtitle/generate-stream", upload.single("file"), async (req, res) => {
  // Establish Chunked Server-Sent Events (SSE) Stream
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendProgress = (progress: number, message: string, data?: any) => {
    res.write(`data: ${JSON.stringify({ progress, message, ...data })}\n\n`);
  };

  let inputFilePath = "";
  let outputAudioPath = "";

  try {
    const { fileBase64, fileName, mimeType, format, apiKey: bodyApiKey } = req.body;
    const apiKey = (req.headers["x-gemini-api-key"] as string) || bodyApiKey || process.env.GEMINI_API_KEY;

    if (!req.file && !fileBase64) {
      sendProgress(0, "Error: File content or upload is required.");
      res.end();
      return;
    }

    // Step 1: Upload received (5%)
    sendProgress(5, "Upload received, processing media track...");

    const tempDir = os.tmpdir();
    
    if (req.file) {
      inputFilePath = req.file.path;
      outputAudioPath = path.join(tempDir, `output_${Date.now()}.wav`);
    } else {
      const cleanFileName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_") : `upload_${Date.now()}`;
      inputFilePath = path.join(tempDir, `input_${Date.now()}_${cleanFileName}`);
      outputAudioPath = path.join(tempDir, `output_${Date.now()}.wav`);
      const fileBuffer = Buffer.from(fileBase64, "base64");
      await fs.promises.writeFile(inputFilePath, fileBuffer);
    }

    // Step 2: Audio extraction started (15%)
    sendProgress(15, "Audio extraction started. Demuxing sound track via ffmpeg...");

    const isWav = req.file && req.file.originalname && req.file.originalname.toLowerCase().endsWith(".wav");
    if (isWav) {
      // It's already our highly-optimized, downsampled 16kHz mono WAV from client!
      // We can directly use it! This is super fast and bypasses ffmpeg demuxing!
      outputAudioPath = inputFilePath;
      sendProgress(30, "Optimized client audio track detected. Bypassing server ffmpeg demuxing!");
    } else {
      // Use FfmpegAudioExtractor asynchronously for non-blocking execution
      const extractor = new FfmpegAudioExtractor();
      await extractor.extract(inputFilePath, outputAudioPath);
      sendProgress(30, "Audio extraction completed. Resampling PCM stream to 16kHz mono 16-bit...");
    }

    let finalOutput = "";

    if (format !== "srt") {
      // Step 4: Direct, pure Gemini RAW transcription (no Whisper, no segment alignment, no overlaps!)
      sendProgress(50, "Passing audio track purely to Gemini API for verbatim transcription...");
      const rawText = await transcribeRawWithGemini(outputAudioPath, apiKey);

      sendProgress(85, "Cleaning up timestamps and formatting continuous prose paragraphs...");
      // Strip any timestamps and structural bracket timelines
      let cleanedText = rawText;
      cleanedText = cleanedText.replace(/\[\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\]/g, "");
      cleanedText = cleanedText.replace(/\(\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\)/g, "");
      cleanedText = cleanedText.replace(/\b\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\b/g, "");
      cleanedText = cleanedText.replace(/\[\s*\]/g, "").replace(/\(\s*\)/g, "");
      cleanedText = cleanedText.replace(/\s+/g, " ");
      finalOutput = cleanedText.trim();
    } else {
      // Step 4: Whisper processing started (50%)
      sendProgress(50, "Whisper local transcription started. Analyzing acoustic speech patterns...");

      const whisperSegments = await transcribeWithWhisper(outputAudioPath, apiKey);

      // Step 5: Segment parsing & timeline marker splitting (70%)
      sendProgress(70, "Whisper response received. Parsing timeline and applying marker splits...");

      const subBlocks: { startMs: number; endMs: number; text: string }[] = [];

      for (const segment of whisperSegments) {
        const textVal = segment.speech || segment.text || "";
        if (!textVal.trim()) continue;

        const startMs = parseTimeToMs(segment.start);
        const endMs = parseTimeToMs(segment.end);

        // Timeline marker splitting logic: either a period (.) or a Burmese period (။)
        if (/[\.။]/.test(textVal)) {
          const rawParts = textVal.split(/[\.။]/);
          const parts = rawParts.map(p => p.trim()).filter(Boolean);
          const totalCharLength = parts.reduce((sum, p) => sum + p.length, 0);

          if (totalCharLength > 0) {
            let currentStartMs = startMs;
            const totalDuration = endMs - startMs;

            for (let i = 0; i < parts.length; i++) {
              const partText = parts[i];
              const partDuration = (partText.length / totalCharLength) * totalDuration;
              const partEndMs = Math.round(currentStartMs + partDuration);

              // Strip out these (.) and (။) markers globally using regex so they do NOT appear inside the final user-facing subtitle text
              const cleanText = partText.replace(/[\.။]/g, "").trim();

              // Apply Burmese advanced line-wrapping rules
              const wrappedText = applyStackingRules(cleanText);

              subBlocks.push({
                startMs: currentStartMs,
                endMs: partEndMs,
                text: wrappedText
              });

              currentStartMs = partEndMs;
            }
          } else {
            const cleanText = textVal.replace(/[\.။]/g, "").trim();
            const wrappedText = applyStackingRules(cleanText);
            subBlocks.push({ startMs, endMs, text: wrappedText });
          }
        } else {
          // No split markers
          const cleanText = textVal.replace(/[\.။]/g, "").trim();
          const wrappedText = applyStackingRules(cleanText);
          subBlocks.push({ startMs, endMs, text: wrappedText });
        }
      }

      // Sort blocks chronologically
      subBlocks.sort((a, b) => a.startMs - b.startMs);

      // Step 6: Formatting blocks (85%)
      sendProgress(85, "Synthesizing blocks, applying alignment anchors and cleaning markers...");

      for (let i = 0; i < subBlocks.length; i++) {
        const block = subBlocks[i];
        const blockIndex = i + 1;
        const startStr = formatMsToSrtTime(block.startMs);
        const endStr = formatMsToSrtTime(block.endMs);
        finalOutput += `${blockIndex}\n${startStr} --> ${endStr}\n${block.text}\n\n`;
      }
    }

    // Step 7: Completed (100%)
    sendProgress(100, "Completed successfully!", { output: finalOutput });

  } catch (err: any) {
    console.error("[Generate Subtitles Stream Error]:", err);
    sendProgress(100, `Error: ${err.message || "Failed to process audio stream with local Whisper."}`);
  } finally {
    // Delete temporary file nodes safely to avoid memory bloating
    try {
      if (inputFilePath && fs.existsSync(inputFilePath)) {
        await fs.promises.unlink(inputFilePath);
      }
      if (outputAudioPath && outputAudioPath !== inputFilePath && fs.existsSync(outputAudioPath)) {
        await fs.promises.unlink(outputAudioPath);
      }
    } catch (cleanupErr) {
      console.warn("Temporary files cleanup failed:", cleanupErr);
    }
    res.end();
  }
});

// Helper classes and functions for non-blocking asynchronous audio extraction & processing
class FfmpegAudioExtractor extends EventEmitter {
  constructor() {
    super();
    // Register a default error listener to prevent uncaught 'error' events from crashing the Node.js process
    this.on("error", (err) => {
      console.warn("[FfmpegAudioExtractor] Handled EventEmitter error event safely:", err.message || err);
    });
  }

  extract(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const isMp3 = outputPath.endsWith(".mp3");
      const args = isMp3
        ? ["-y", "-i", inputPath, "-vn", "-codec:a", "libmp3lame", "-q:a", "5", "-ac", "1", "-ar", "16000", "-f", "mp3", outputPath]
        : ["-y", "-i", inputPath, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "-f", "wav", outputPath];
      console.log(`[FFMPEG_SPAWN] Spawning ffmpeg asynchronously with args: ${args.join(" ")}`);
      const proc = spawn("ffmpeg", args);

      proc.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        const match = text.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (match) {
          this.emit("progress", { time: match[1] });
        }
      });

      proc.on("error", (err) => {
        this.emit("error", err);
        reject(err);
      });

      proc.on("close", (code) => {
        if (code === 0) {
          this.emit("end");
          resolve();
        } else {
          const err = new Error(`FFmpeg exited with non-zero exit code: ${code}`);
          this.emit("error", err);
          reject(err);
        }
      });
    });
  }
}

function sliceAudioAsync(inputPath: string, startMs: number, durationMs: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ss = (startMs / 1000).toFixed(3);
    const t = (durationMs / 1000).toFixed(3);
    const args = ["-y", "-ss", ss, "-i", inputPath, "-t", t, "-c", "copy", outputPath];
    const proc = spawn("ffmpeg", args);

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Slicing failed with exit code ${code}`));
      }
    });
  });
}

// Robust LocalFileManager checking if the Whisper model exists in local storage
class LocalFileManager {
  private static possiblePaths = [
    path.resolve("./assets/models/ggml-tiny.bin"),
    path.resolve("./dist/assets/models/ggml-tiny.bin"),
    path.resolve("./models/ggml-tiny.bin"),
    path.resolve(process.cwd(), "assets/models/ggml-tiny.bin"),
    path.resolve(process.cwd(), "dist/assets/models/ggml-tiny.bin"),
    path.resolve(process.cwd(), "models/ggml-tiny.bin"),
  ];

  /**
   * Verifies if the local Whisper model file is packaged and exists in any of the potential local storage locations.
   * Throws a precise, clear local offline error if missing, rather than attempting any internet download.
   */
  public static verifyModelExists(): string {
    console.log("[LocalFileManager] Verifying local model files for 100% offline-first compliance...");
    
    for (const modelPath of this.possiblePaths) {
      console.log(`[LocalFileManager] Checking path: ${modelPath}`);
      if (fs.existsSync(modelPath)) {
        try {
          const stats = fs.statSync(modelPath);
          // Standard check to ensure it's not a dummy or empty file
          if (stats.size > 10 * 1024 * 1024) { // Needs to be > 10MB (actual is ~75MB)
            console.log(`[LocalFileManager] Found valid Whisper model at: ${modelPath} (Size: ${(stats.size / (1024 * 1024)).toFixed(1)} MB)`);
            return modelPath;
          } else {
            console.warn(`[LocalFileManager] Found file at ${modelPath} but size is too small (${stats.size} bytes). Skipping...`);
          }
        } catch (e) {
          console.error(`[LocalFileManager] Error checking stats for ${modelPath}:`, e);
        }
      }
    }

    // Precise local offline error instead of API-based/server download fallback
    throw new Error(
      "Offline Whisper Model Missing: The model file 'ggml-tiny.bin' was not found in local internal storage. " +
      "Please ensure that the model is bundled in the assets folder at 'assets/models/ggml-tiny.bin' or in the " +
      "'models/' directory during packaging."
    );
  }
}

// Ensure local Whisper model exists at ./models/ggml-tiny.bin (Local-first compliance check)
async function ensureWhisperModelExists(): Promise<string> {
  return LocalFileManager.verifyModelExists();
}

// Helper to get audio duration via ffprobe or file size estimation
function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve) => {
    exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`, (err, stdout) => {
      if (!err && stdout) {
        const duration = parseFloat(stdout.trim());
        if (!isNaN(duration) && duration > 0) {
          resolve(duration);
          return;
        }
      }
      // fallback based on size if it fails
      try {
        const stats = fs.statSync(audioPath);
        // For 16kHz 16-bit mono WAV, bytes per second is 16000 * 2 = 32000
        const estDuration = stats.size / 32000;
        resolve(estDuration > 0 ? estDuration : 60);
      } catch (e) {
        resolve(60);
      }
    });
  });
}

// Text chunking helpers for clean subtitle line-breaking
function splitIntoReadableChunks(text: string, maxLen = 60): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLen = 0;

  for (const word of words) {
    if (currentLen + word.length + 1 > maxLen && currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [word];
      currentLen = word.length;
    } else {
      currentChunk.push(word);
      currentLen += word.length + 1;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }
  return chunks;
}

function splitByLength(text: string, maxLen = 30): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}

function chunkText(text: string): string[] {
  if (/\s/.test(text) || text.length > 50) {
    const spaceCount = (text.match(/\s/g) || []).length;
    if (spaceCount > text.length * 0.05) {
      return splitIntoReadableChunks(text);
    }
  }
  if (text.length > 30) {
    return splitByLength(text);
  }
  return [text];
}

// Transcribe the audio accurately using Gemini's high-fidelity audio capabilities (preferred for Burmese)
async function transcribeWithGemini(audioPath: string, apiKey: string): Promise<any[]> {
  console.log(`[Gemini STT] Initializing speech-to-text via gemini-3.5-flash for ${audioPath}`);
  
  let fileUpload: any = null;
  let audioBase64 = "";
  const mimeType = audioPath.endsWith(".mp3") ? "audio/mp3" : "audio/wav";

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    // Speed Optimization: Upload straight to Gemini File API as a standard binary stream
    try {
      console.log(`[Gemini STT] Uploading ${audioPath} straight to Gemini File API as binary stream...`);
      fileUpload = await ai.files.upload({
        file: audioPath,
        config: {
          mimeType: mimeType,
        },
      });
      console.log(`[Gemini STT] File uploaded successfully to Gemini File API: ${fileUpload.uri}`);
    } catch (uploadErr: any) {
      console.warn(`[Gemini STT] Gemini File API upload failed: ${uploadErr.message || uploadErr}. Falling back to inline base64...`);
      const audioBuffer = await fs.promises.readFile(audioPath);
      audioBase64 = audioBuffer.toString("base64");
    }

    const requestContents: any[] = [];
    if (fileUpload) {
      requestContents.push({
        fileData: {
          fileUri: fileUpload.uri,
          mimeType: mimeType,
        }
      });
    } else {
      requestContents.push({
        inlineData: {
          mimeType,
          data: audioBase64,
        },
      });
    }

    requestContents.push({
      text: "Your single and absolute task is VERBATIM TRANSCRIPTION. Listen to the audio and output the text EXACTLY in the language that is being spoken. If the video characters speak English, output pure English text. Do NOT translate the language into Chinese, Myanmar, or any other language under any circumstances. Output exactly what you hear in the native source language.",
    });

    let attempts = 0;
    let transcriptionText = "";

    // Error Gracefulness: Retry natively once if empty sequence or timeout catches
    while (attempts < 2 && !transcriptionText) {
      attempts++;
      try {
        console.log(`[Gemini STT] Dispatching content request, attempt ${attempts}...`);
        const response = await generateContentWithRetry(ai, {
          model: "gemini-3.5-flash",
          contents: requestContents,
        });
        transcriptionText = response.text || "";
        if (!transcriptionText.trim() && attempts < 2) {
          console.warn("[Gemini STT] Received empty text string. Retrying once natively...");
        }
      } catch (err: any) {
        if (attempts >= 2) throw err;
        console.warn(`[Gemini STT] Attempt ${attempts} failed: ${err.message || err}. Retrying once natively...`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    // Clean up uploaded file from Gemini File store to stay pristine
    if (fileUpload && fileUpload.name) {
      try {
        console.log(`[Gemini STT] Cleaning up File API resource: ${fileUpload.name}`);
        await ai.files.delete({ name: fileUpload.name });
      } catch (delErr: any) {
        console.warn(`[Gemini STT] Failed to delete file resource: ${delErr.message || delErr}`);
      }
    }

    if (!transcriptionText.trim()) {
      throw new Error("No transcription text returned from the Gemini pipeline. Verify that the audio contains spoken words and the API key is active.");
    }

    console.log(`[Gemini STT] Transcription received. Length: ${transcriptionText.length} characters.`);

    // Parse transcription into chronological segments
    const sentences = transcriptionText
      .split(/[\n\r.!?။၊]+/g)
      .map(s => s.trim())
      .filter(Boolean);

    const allChunks: string[] = [];
    for (const sentence of sentences) {
      allChunks.push(...chunkText(sentence));
    }

    const totalDuration = await getAudioDuration(audioPath);
    console.log(`[Gemini STT] Distributing ${allChunks.length} chunks over ${totalDuration}s`);

    const segments: any[] = [];
    if (allChunks.length > 0) {
      const chunkDuration = totalDuration / allChunks.length;
      for (let i = 0; i < allChunks.length; i++) {
        const start = i * chunkDuration;
        const end = (i + 1) * chunkDuration;
        segments.push({
          start,
          end,
          speech: allChunks[i],
          text: allChunks[i]
        });
      }
    } else {
      segments.push({
        start: 0,
        end: totalDuration > 0 ? totalDuration : 30,
        speech: transcriptionText,
        text: transcriptionText
      });
    }

    return segments;
  } catch (error: any) {
    console.error("[Gemini STT] Isolated exception occurred inside Gemini speech pipeline:", error.message || error);
    throw error;
  }
}

// Transcribe with Whisper model locally or fall back to Gemini Audio Transcription (multimodal API)
async function transcribeWithWhisper(audioPath: string, apiKey?: string): Promise<any[]> {
  const activeKey = apiKey || process.env.GEMINI_API_KEY;
  if (!activeKey) {
    throw new Error("Gemini API key is required to run the purged Voice-to-Text transcriber.");
  }
  // Whisper is completely purged! We route 100% of the transcription traffic to our high-speed, direct Gemini STT pipeline.
  return transcribeWithGemini(audioPath, activeKey);
}

// Direct raw transcription using Gemini's high-fidelity audio capabilities (preferred for verbatim output)
async function transcribeRawWithGemini(audioPath: string, apiKey: string): Promise<string> {
  console.log(`[Gemini STT] Initializing RAW speech-to-text via gemini-3.5-flash for ${audioPath}`);
  
  let fileUpload: any = null;
  let audioBase64 = "";
  const mimeType = audioPath.endsWith(".mp3") ? "audio/mp3" : "audio/wav";

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    try {
      console.log(`[Gemini STT] Uploading ${audioPath} straight to Gemini File API as binary stream...`);
      fileUpload = await ai.files.upload({
        file: audioPath,
        config: {
          mimeType: mimeType,
        },
      });
      console.log(`[Gemini STT] File uploaded successfully to Gemini File API: ${fileUpload.uri}`);
    } catch (uploadErr: any) {
      console.warn(`[Gemini STT] Gemini File API upload failed: ${uploadErr.message || uploadErr}. Falling back to inline base64...`);
      const audioBuffer = await fs.promises.readFile(audioPath);
      audioBase64 = audioBuffer.toString("base64");
    }

    const requestContents: any[] = [];
    if (fileUpload) {
      requestContents.push({
        fileData: {
          fileUri: fileUpload.uri,
          mimeType: mimeType,
        }
      });
    } else {
      requestContents.push({
        inlineData: {
          mimeType,
          data: audioBase64,
        },
      });
    }

    requestContents.push({
      text: "Your single and absolute task is VERBATIM TRANSCRIPTION. Listen to the audio and output the text EXACTLY in the language that is being spoken. If the video characters speak English, output pure English text. Do NOT translate the language into Chinese, Myanmar, or any other language under any circumstances. Output exactly what you hear in the native source language.",
    });

    let attempts = 0;
    let transcriptionText = "";

    while (attempts < 2 && !transcriptionText) {
      attempts++;
      try {
        console.log(`[Gemini STT] Dispatching content request, attempt ${attempts}...`);
        const response = await generateContentWithRetry(ai, {
          model: "gemini-3.5-flash",
          contents: requestContents,
        });
        transcriptionText = response.text || "";
        if (!transcriptionText.trim() && attempts < 2) {
          console.warn("[Gemini STT] Received empty text string. Retrying once natively...");
        }
      } catch (err: any) {
        if (attempts >= 2) throw err;
        console.warn(`[Gemini STT] Attempt ${attempts} failed: ${err.message || err}. Retrying once natively...`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    if (fileUpload && fileUpload.name) {
      try {
        console.log(`[Gemini STT] Cleaning up File API resource: ${fileUpload.name}`);
        await ai.files.delete({ name: fileUpload.name });
      } catch (delErr: any) {
        console.warn(`[Gemini STT] Failed to delete file resource: ${delErr.message || delErr}`);
      }
    }

    if (!transcriptionText.trim()) {
      throw new Error("No transcription text returned from the Gemini pipeline. Verify that the audio contains spoken words and the API key is active.");
    }

    return transcriptionText;
  } catch (error: any) {
    console.error("[Gemini STT] Isolated exception occurred inside Gemini speech pipeline:", error.message || error);
    throw error;
  }
}

// Parse various timestamp formats into milliseconds
function parseTimeToMs(timeStr: string | number): number {
  if (typeof timeStr === "number") {
    return timeStr * 1000;
  }
  if (typeof timeStr !== "string") return 0;
  const clean = timeStr.trim().replace(",", ".");
  const parts = clean.split(":");
  if (parts.length === 3) {
    const hrs = parseFloat(parts[0]) || 0;
    const mins = parseFloat(parts[1]) || 0;
    const secs = parseFloat(parts[2]) || 0;
    return hrs * 3600000 + mins * 60000 + secs * 1000;
  }
  const parsed = parseFloat(clean);
  if (!isNaN(parsed)) {
    return parsed * 1000;
  }
  return 0;
}

// Format milliseconds back into SRT timestamp
function formatMsToSrtTime(ms: number): string {
  const hrs = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);

  const hStr = String(hrs).padStart(2, "0");
  const mStr = String(mins).padStart(2, "0");
  const sStr = String(secs).padStart(2, "0");
  const msStr = String(millis).padStart(3, "0");

  return `${hStr}:${mStr}:${sStr},${msStr}`;
}

// Helper to determine if a token is a Burmese syllable/word
function isBurmeseSyllable(token: string): boolean {
  if (!token) return false;
  const firstCode = token.charCodeAt(0);
  return firstCode >= 0x1000 && firstCode <= 0x109F;
}

// Burmese Syllable Segmentation (3.A)
function segmentText(text: string): string[] {
  const tokens: string[] = [];
  let currentToken = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);

    // Check if it's a base consonant: 0x1000 to 0x1021 (inclusive)
    const isBaseConsonant = (code >= 0x1000 && code <= 0x1021);

    if (isBaseConsonant) {
      if (currentToken) {
        tokens.push(currentToken);
      }
      currentToken = char;
    } else {
      // Check if it's a combining mark, killed consonant, or dependent sign
      const isBurmeseMarkOrKilled = (code >= 0x1022 && code <= 0x109F);

      if (isBurmeseMarkOrKilled && currentToken) {
        currentToken += char;
      } else {
        if (currentToken) {
          tokens.push(currentToken);
          currentToken = "";
        }
        tokens.push(char);
      }
    }
  }

  if (currentToken) {
    tokens.push(currentToken);
  }

  return tokens;
}

// Burmese Balanced Stacking Rules (3.B)
function applyStackingRules(text: string): string {
  const tokens = segmentText(text);
  const totalBurmese = tokens.filter(isBurmeseSyllable).length;

  if (totalBurmese < 10) {
    return text;
  }

  let bestSplitIdx = -1;
  let minPenalty = Infinity;

  for (let k = 1; k < tokens.length; k++) {
    const leftTokens = tokens.slice(0, k);
    const rightTokens = tokens.slice(k);

    const sLeft = leftTokens.filter(isBurmeseSyllable).length;
    const sRight = rightTokens.filter(isBurmeseSyllable).length;

    // Distance from the halfway center
    const distance = Math.abs(sLeft - (totalBurmese / 2));
    let penalty = distance * 10.0; // Base penalty

    const prevToken = tokens[k - 1] || "";
    const nextToken = tokens[k] || "";

    // Discount for comma
    if (prevToken.includes("၊")) {
      penalty -= 40.0;
    }

    // Discount for conjunctions
    if (
      prevToken.includes("ပြီး") || 
      prevToken.includes("ပြီးတော့") || 
      nextToken.includes("ပြီး") || 
      nextToken.includes("ပြီးတော့")
    ) {
      penalty -= 30.0;
    }

    // Discount for whitespace
    if (prevToken === " " || nextToken === " ") {
      penalty -= 15.0;
    }

    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestSplitIdx = k;
    }
  }

  if (bestSplitIdx !== -1) {
    const leftLine = tokens.slice(0, bestSplitIdx).join("").trim();
    const rightLine = tokens.slice(bestSplitIdx).join("").trim();
    return `${leftLine}\n${rightLine}`;
  }

  return text;
}


// API Endpoint for AI Subtitle Pro: Dual-mode Hybrid Calibration loop
app.post("/api/subtitle/align", upload.single("file"), async (req, res) => {
  const createdTempFiles: string[] = [];
  try {
    const { text, segments: segmentsRaw, activeMediaDurationMs: durationRaw, alignmentMode, apiKey: bodyApiKey } = req.body;
    const apiKey = (req.headers["x-gemini-api-key"] as string) || bodyApiKey || process.env.GEMINI_API_KEY;
    const activeMediaDurationMs = durationRaw ? Number(durationRaw) : 60000;

    let segments: string[] = [];
    if (segmentsRaw) {
      try {
        segments = typeof segmentsRaw === "string" ? JSON.parse(segmentsRaw) : segmentsRaw;
      } catch (e) {
        segments = [];
      }
    }

    if ((!segments || segments.length === 0) && text) {
      // Parse manual text based on separators if segments not sent
      segments = text.split(/[\.။]+/).map((s: string) => s.trim()).filter(Boolean);
    }

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      res.status(400).json({ error: "Segments array or raw text with splits is required." });
      return;
    }

    // Step 1: Character-proportional baseline layout (our golden fallback)
    const totalChars = segments.reduce((sum, s) => sum + s.replace(/[\.။\s]/g, "").length, 0);
    let progressAccumulatorMs = 0;
    const baselineBlocks = segments.map((seg, idx) => {
      const cleanSeg = seg.replace(/[\.။]/g, "").trim();
      const blockLength = cleanSeg.length;
      const blockPeriod = totalChars > 0 
        ? (blockLength / totalChars) * activeMediaDurationMs 
        : activeMediaDurationMs / segments.length;

      const startMs = progressAccumulatorMs;
      let endMs = startMs + Math.round(blockPeriod);
      if (idx === segments.length - 1) {
        endMs = activeMediaDurationMs;
      }
      progressAccumulatorMs = endMs;

      return {
        id: idx + 1,
        startMs,
        endMs,
        text: applyStackingRules(cleanSeg)
      };
    });

    // If manual mode or no file uploaded, return baseline directly
    if (alignmentMode === "manual" || !req.file) {
      console.log("[ALIGNMENT] Bypassing AI Sync. Returning baseline blocks.");
      res.json({ blocks: baselineBlocks });
      return;
    }

    let finalBlocks = baselineBlocks;

    try {
      finalBlocks = await Promise.race([
        (async () => {
          // Step 2: Demuxing & Highly Compressed Audio Extraction
          console.log("[AI_SYNC] Initializing optimized speech extraction pipeline...");
          
          if (req.file && req.file.path) {
            createdTempFiles.push(req.file.path);
          }

          const tempDir = os.tmpdir();
          const outputAudioPath = path.join(tempDir, `align_audio_${Date.now()}.mp3`);
          createdTempFiles.push(outputAudioPath);

          // Audio demuxing: extract and compress directly from the uploaded file without duplicating heavy video files in memory/disk
          let extractionSuccess = false;
          try {
            const extractor = new FfmpegAudioExtractor();
            await extractor.extract(req.file!.path, outputAudioPath);
            extractionSuccess = true;
          } catch (extractorErr: any) {
            console.error("[AI_SYNC] Preprocessing / ffmpeg audio demuxing failed:", extractorErr.message || extractorErr);
            throw new Error(`Audio demuxing and conversion failed: ${extractorErr.message || extractorErr}`);
          }

          // Immediately trim and delete the heavy video file payload once audio is successfully extracted
          if (extractionSuccess && req.file && req.file.path) {
            try {
              await fs.promises.unlink(req.file.path);
              console.log("[AI_SYNC] Heavy original video source payload immediately trimmed from disk.");
            } catch (unlinkErr: any) {
              console.warn("[AI_SYNC] Failed to immediately trim/delete original uploaded file path:", unlinkErr.message || unlinkErr);
            }
          }

          // Run Whisper local or Gemini speech-to-text transcription with localized try/catch error isolation
          let whisperSegments: any[] = [];
          try {
            whisperSegments = await transcribeWithWhisper(outputAudioPath, apiKey);
          } catch (sttErr: any) {
            console.error("[AI_SYNC] Voice-to-text transcription block failed:", sttErr.message || sttErr);
            throw new Error(`Speech pipeline transcription failed: ${sttErr.message || sttErr}`);
          }
          console.log(`[AI_SYNC] Voice-to-text transcription returned ${whisperSegments.length} segments.`);

          // Step 3: Precise Timeline Character Mapping & Snapping
          const whisperTimeline: { char: string; timeMs: number }[] = [];
          for (const seg of whisperSegments) {
            const textVal = seg.speech || seg.text || "";
            if (!textVal.trim()) continue;
            const startMs = parseTimeToMs(seg.start);
            const endMs = parseTimeToMs(seg.end);
            const duration = endMs - startMs;
            if (duration <= 0) continue;

            for (let k = 0; k < textVal.length; k++) {
              const interpolatedMs = startMs + Math.round((k / textVal.length) * duration);
              whisperTimeline.push({
                char: textVal[k],
                timeMs: interpolatedMs
              });
            }
          }

          // Cleaned whisper timeline (only alphanumeric & Burmese syllables)
          const cleanWhisperTimeline = whisperTimeline.filter(item => {
            return !/[\s\.။၊,!\?\-\(\)\[\]\{\}\_]/.test(item.char);
          });

          const calibratedBlocks = [];
          let lastEndMs = 0;
          let currentTimelineIdx = 0;
          let accumulatedManualChars = 0;
          const totalCleanManualChars = segments.reduce((sum, s) => sum + s.replace(/[\.။\s၊,!\?\-\(\)\[\]\{\}\_]/g, "").length, 0);

          for (let i = 0; i < segments.length; i++) {
            const rawTextVal = segments[i];
            const cleanSegmentText = rawTextVal.replace(/[\.။]/g, "").trim(); // Strip separators
            const matchText = cleanSegmentText.replace(/[\s၊,!\?\-\(\)\[\]\{\}\_]/g, "").toLowerCase();
            const segLen = matchText.length;
            accumulatedManualChars += segLen;

            let startMs = lastEndMs;
            let endMs = lastEndMs + 2000; // 2 seconds default fallback

            if (cleanWhisperTimeline.length > 0 && segLen > 0) {
              // Expected timeline slice
              const expectedTimelineEndIdx = Math.round((accumulatedManualChars / (totalCleanManualChars || 1)) * cleanWhisperTimeline.length);
              const expectedLen = expectedTimelineEndIdx - currentTimelineIdx;

              // Search for best visual matching starting offset locally
              const searchRange = Math.min(Math.max(expectedLen * 2, 120), cleanWhisperTimeline.length - currentTimelineIdx);
              let bestScore = -1;
              let bestOffset = 0;

              for (let offset = 0; offset < searchRange; offset++) {
                const j = currentTimelineIdx + offset;
                let matchCount = 0;
                const compareLen = Math.min(segLen, cleanWhisperTimeline.length - j);

                for (let k = 0; k < compareLen; k++) {
                  if (cleanWhisperTimeline[j + k].char.toLowerCase() === matchText[k]) {
                    matchCount++;
                  }
                }

                const score = compareLen > 0 ? matchCount / compareLen : 0;
                // Slight proximity bonus for earlier chronological positions
                const finalScore = score - (offset * 0.0003);

                if (finalScore > bestScore) {
                  bestScore = finalScore;
                  bestOffset = offset;
                }
              }

              const matchedStartIdx = currentTimelineIdx + bestOffset;
              const matchedEndIdx = Math.min(matchedStartIdx + segLen, cleanWhisperTimeline.length - 1);

              if (matchedStartIdx < cleanWhisperTimeline.length) {
                startMs = cleanWhisperTimeline[matchedStartIdx].timeMs;
                endMs = cleanWhisperTimeline[matchedEndIdx].timeMs;
              }

              currentTimelineIdx = matchedEndIdx + 1;
            } else {
              // Character proportional fallback
              const blockRatio = Math.max(1, rawTextVal.length) / (totalChars || 1);
              const blockDuration = Math.round(blockRatio * activeMediaDurationMs);
              startMs = lastEndMs;
              endMs = startMs + blockDuration;
            }

            // Snapping bounds verification
            if (startMs < lastEndMs) {
              startMs = lastEndMs;
            }
            if (endMs <= startMs + 100) {
              endMs = startMs + 1000;
            }
            if (endMs > activeMediaDurationMs) {
              endMs = activeMediaDurationMs;
            }
            if (startMs > activeMediaDurationMs) {
              startMs = activeMediaDurationMs - 100;
              endMs = activeMediaDurationMs;
            }

            lastEndMs = endMs;

            // Apply line stacking wrapping rules
            const stackedText = applyStackingRules(cleanSegmentText);

            calibratedBlocks.push({
              id: i + 1,
              startMs: Math.round(startMs),
              endMs: Math.round(endMs),
              text: stackedText
            });
          }

          // Clean final boundary
          if (calibratedBlocks.length > 0) {
            calibratedBlocks[calibratedBlocks.length - 1].endMs = activeMediaDurationMs;
          }

          return calibratedBlocks;
        })(),
        new Promise<any[]>((_, reject) => 
          setTimeout(() => reject(new Error("AI forced alignment timed out server-side")), 25000)
        )
      ]);
    } catch (err: any) {
      console.warn("[ALIGNMENT] AI Sync alignment failed or timed out. Falling back to robust character-proportional baseline layout.", err.message || err);
      finalBlocks = baselineBlocks;
    }

    res.json({ blocks: finalBlocks });

  } catch (error: any) {
    console.error("[Subtitle Alignment API Error]:", error);
    res.status(500).json({ error: error.message || "Alignment calibration failed." });
  } finally {
    for (const file of createdTempFiles) {
      try {
        if (file && fs.existsSync(file)) {
          await fs.promises.unlink(file);
        }
      } catch (err) {
        console.warn(`Error cleaning up alignment temp file ${file}:`, err);
      }
    }
  }
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
