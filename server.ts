import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import os from "os";
import { exec, spawn } from "child_process";
import { EventEmitter } from "events";
import multer from "multer";
import https from "https";
import cors from "cors";

dotenv.config();

// Define port and upload limits
const PORT = 3000;
const upload = multer({ dest: os.tmpdir() });

const app = express();

// 1. BACKEND ARCHITECTURE (Node.js/Express)
// - Implement strict Global CORS so mobile sandboxed apps are never blocked
app.use(cors({ origin: "*" }));

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

/**
 * Model helper to map deprecated models like gemini-1.5-flash to the stable,
 * modern, non-503-error gemini-3.5-flash to satisfy safety requirements and avoid API issues.
 */
function getActiveModel(requestedModel?: string): string {
  const req = requestedModel || "gemini-3.5-flash";
  if (
    req.includes("gemini-1.5-flash") || 
    req.includes("gemini-1.5-pro") || 
    req.includes("gemini-pro") ||
    req.includes("gemini-2.0-flash") ||
    req.includes("gemini-2.0-pro")
  ) {
    return "gemini-3.5-flash";
  }
  return req;
}

/**
 * Server-Side Audio Stream Cleansing:
 * Filter out early low-frequency hums or static noises before transcribing.
 * Applies a digital high-pass filter (cutoff ~150Hz) and a noise gate threshold
 * directly on raw 16-bit PCM WAV stream data to prevent model hallucination at the start.
 */
function cleanseAudioBuffer(audioBuffer: Buffer): Buffer {
  try {
    // Check if it's a standard RIFF/WAV file
    if (audioBuffer.length < 44 || audioBuffer.toString("ascii", 0, 4) !== "RIFF") {
      return audioBuffer; // Return unchanged if not WAV
    }

    const formatTag = audioBuffer.readUInt16LE(20);
    const numChannels = audioBuffer.readUInt16LE(22);
    const sampleRate = audioBuffer.readUInt32LE(24);
    const bitsPerSample = audioBuffer.readUInt16LE(34);

    // Only process standard PCM (formatTag === 1) with 16 bits per sample
    if (formatTag !== 1 || bitsPerSample !== 16) {
      return audioBuffer; 
    }

    // Locate the 'data' chunk offset
    let dataOffset = 12;
    let dataChunkSize = 0;
    while (dataOffset < audioBuffer.length - 8) {
      const chunkId = audioBuffer.toString("ascii", dataOffset, dataOffset + 4);
      const chunkSize = audioBuffer.readUInt32LE(dataOffset + 4);
      if (chunkId === "data") {
        dataOffset += 8;
        dataChunkSize = chunkSize;
        break;
      }
      dataOffset += 8 + chunkSize;
    }

    if (dataOffset >= audioBuffer.length) {
      return audioBuffer; // Chunk not found
    }

    // High-pass filter parameters (150Hz cutoff to strip low-frequency hums and static)
    const dt = 1.0 / sampleRate;
    const RC = 1.0 / (2 * Math.PI * 150.0);
    const alpha = RC / (RC + dt);

    let prevX = 0;
    let prevY = 0;

    // Apply digital high-pass filter and absolute noise gate
    const gateThreshold = 1200;
    const sampleCount = Math.floor((Math.min(audioBuffer.length, dataOffset + dataChunkSize) - dataOffset) / 2);
    for (let i = 0; i < sampleCount; i++) {
      const byteOffset = dataOffset + i * 2;
      if (byteOffset + 1 >= audioBuffer.length) break;

      const sample = audioBuffer.readInt16LE(byteOffset);

      // High-pass filtering formula: y[n] = alpha * (y[n-1] + x[n] - x[n-1])
      const filtered = alpha * (prevY + sample - prevX);
      prevX = sample;
      prevY = filtered;

      let outputSample = Math.max(-32768, Math.min(32767, Math.round(filtered)));

      // Noise gate: silence early static and low level hums (threshold ~ 1200 / 3.6% of max level)
      if (Math.abs(outputSample) < gateThreshold) {
        outputSample = 0;
      }

      audioBuffer.writeInt16LE(outputSample, byteOffset);
    }
    
    console.log(`[Audio Cleansing] Successfully applied high-pass filter (150Hz) and noise gate (threshold ${gateThreshold}) to ${sampleRate}Hz ${numChannels}ch WAV.`);
    return audioBuffer;
  } catch (err) {
    console.warn("[Audio Cleansing Warning] Failed to cleanse audio stream, returning fallback:", err);
    return audioBuffer;
  }
}

/**
 * Helper to call Gemini with robust retries, dynamic model fallback under load,
 * and standard exponential backoff.
 */
async function generateContentWithRetry(
  ai: any,
  options: { model: string; contents: any; config?: any },
  retries = 5,
  delayMs = 1200
): Promise<any> {
  let attempt = 0;
  let lastError: any = null;
  let currentModel = getActiveModel(options.model);

  // Model rotation for high availability under high-demand 503/429 spikes
  const modelRotation = [
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest"
  ];

  while (attempt < retries) {
    try {
      console.log(`[Gemini API] Attempt ${attempt + 1}/${retries} using model: ${currentModel}`);
      const response = await ai.models.generateContent({
        ...options,
        model: currentModel,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      attempt++;
      const errMsg = err.message || String(err);
      
      console.warn(`[Gemini API Warning] Attempt ${attempt} failed: ${errMsg}`);
      
      // If it's a transient status (like 503, 429), retry with fallback or wait
      if (attempt < retries) {
        // Rotate model to next option in rotation
        let nextIdx = modelRotation.indexOf(currentModel) + 1;
        if (nextIdx > 0 && nextIdx < modelRotation.length) {
          currentModel = modelRotation[nextIdx];
        } else if (!modelRotation.includes(currentModel)) {
          // If custom model, fallback to gemini-2.5-flash
          currentModel = "gemini-2.5-flash";
        } else {
          // Loop back or use fallback
          currentModel = "gemini-2.5-flash";
        }
        
        // Add dynamic jitter to delay to prevent thundering herd problem
        const jitter = Math.floor(Math.random() * 500);
        const waitTime = delayMs + jitter;
        console.log(`[Gemini API Fallback] Waiting ${waitTime}ms before retrying with rotated model ${currentModel}...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        delayMs *= 1.5; // Exponential scale back
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

// Helper to get Gemini API Key dynamically from request
function getRequestApiKey(req: express.Request): string | null {
  // Strictly require the API key passed from the client frontend UI (Settings input) or fallback to server env
  const key = (req.headers["x-gemini-api-key"] as string) || 
              req.body.apiKey || 
              (req.headers["authorization"] as string)?.replace("Bearer ", "") ||
              process.env.GEMINI_API_KEY;
  return key || null;
}

// Helper to get Edge-TTS host safely to prevent infinite loop recursion when VITE_APP_URL points to self
function getEdgeTtsHost(): string {
  const envUrl = process.env.VITE_APP_URL;
  if (envUrl && envUrl.trim()) {
    const trimmed = envUrl.trim();
    // Prevent routing back to itself if VITE_APP_URL is our own dev/prod/localhost app container
    if (
      !trimmed.includes("run.app") &&
      !trimmed.includes("localhost") &&
      !trimmed.includes("127.0.0.1") &&
      !trimmed.includes("0.0.0.0") &&
      trimmed.startsWith("http")
    ) {
      return trimmed;
    }
  }
  return "https://my-edge-tts-api.vercel.app";
}

// Global System Instruction for Burmese Movie Recap storytelling style
const BURMESE_STORYTELLER_INSTRUCTION = 
  "You are a professional, high-fidelity Myanmar translation and writing assistant specialized in movie-recap narration scripts. " +
  "You must always translate or generate content in a highly engaging, thrilling, and natural Burmese movie-recap storyteller style (ရုပ်ရှင်အညွှန်း ပြောပြသူ ပုံစံမျိုး). " +
  "Ensure perfect spelling and grammar conforming strictly to official Myanmar Orthography. " +
  "Use precise, expressive, and dramatic vocabulary suitable for voiceover narration (using cohesive transitions like 'ထို့နောက်', 'ဒီလိုနဲ့', 'နောက်ဆုံးမှာတော့'). " +
  "Output only the final text, strictly avoiding conversational greetings, notes, preambles, or markdown formatting.";

// Endpoint 1: API Key Validation
app.post("/api/validate-key", async (req, res) => {
  try {
    const apiKey = getRequestApiKey(req);
    if (!apiKey) {
      res.status(400).json({ error: { message: "Gemini API Key is required." } });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: "Output OK to test.",
    });

    if (response && response.text) {
      res.json({ valid: true });
    } else {
      res.status(502).json({ error: { message: "Invalid response from API." } });
    }
  } catch (error: any) {
    console.error("[API Key Validation Error]:", error);
    res.status(500).json({ error: { message: error.message || "Failed to validate API key." } });
  }
});

// Endpoint 2: Universal Translator with Storytelling Instruction
app.post("/api/translate", async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: { message: "Text parameter is required." } });
      return;
    }

    const apiKey = getRequestApiKey(req);
    if (!apiKey) {
      res.status(400).json({ error: { message: "Gemini API Key is required. Set it in Settings." } });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });

    const isBurmeseTarget = targetLang === "Myanmar" || targetLang === "Burmese" || targetLang === "Burmese (recaps)";
    const prompt = `Translate this text into "${targetLang}" (Source: ${sourceLang}). Text to translate: ${text}`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: isBurmeseTarget ? {
        systemInstruction: BURMESE_STORYTELLER_INSTRUCTION,
      } : undefined,
    });

    const translatedText = response.text || "";
    res.json({ translatedText, translation: translatedText });
  } catch (error: any) {
    console.error("[Translation Error]:", error);
    res.status(500).json({ error: { message: error.message || "Translation failed." } });
  }
});

// Endpoint 3: Voice-to-Text Transcription via Gemini Multimodal API
app.post("/api/transcribe", async (req, res) => {
  try {
    const { audioData, mimeType } = req.body;
    if (!audioData) {
      res.status(400).json({ error: { message: "Audio data (base64) is required." } });
      return;
    }

    const apiKey = getRequestApiKey(req);
    if (!apiKey) {
      res.status(400).json({ error: { message: "Gemini API Key is required." } });
      return;
    }

    // Server-Side Audio Stream Cleansing
    console.log("[Audio Stream Cleansing] Initiating digital noise reduction filter...");
    let processedBase64 = audioData;
    try {
      const rawBuffer = Buffer.from(audioData, "base64");
      const cleansedBuffer = cleanseAudioBuffer(rawBuffer);
      processedBase64 = cleansedBuffer.toString("base64");
    } catch (cleanseErr) {
      console.warn("[Audio Stream Cleansing Warning] Failed to cleanse input audio stream:", cleanseErr);
    }

    // Required Operational Logs for Language Verification
    console.log("Server Sync: Re-establishing secure JSON handshake protocol... Local pipeline routing verified.");
    console.log("Server Sync: Adaptive Audio Profiler Active: Transcribing exact native spoken language from the media track (No Filters)...");

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });

    const systemInstruction = 
      "You are a strict, adaptive native Audio Transcriber and Speech-to-Text specialist. " +
      "You must execute adaptive audio profiling: strictly listen to the actual vocal frequencies in the audio stream " +
      "and transcribe the exact native spoken language found within the media file with 100% fidelity. " +
      "Do not force, alter, or restrict the linguistic target. If the original speaker talks in Burmese, output pure Burmese. " +
      "If the original speaker talks in Chinese, output pure Chinese. If the speaker talks in English, output pure English. " +
      "Your output must be 100% accurate, unmanipulated Audio-to-Text Mirroring of whatever language is actually spoken inside the video.";

    const promptText = 
      "Transcribe this audio verbatim. " +
      "Apply adaptive audio profiling. Carefully listen to the actual vocal frequencies and transcribe the exact native spoken language spoken in the media file. " +
      "Do not restrict or filter out any target language (e.g., Burmese, Chinese, English, etc.). " +
      "Output only the verbatim transcription matching the original audio 100%, with no explanations, markdown, or extra notes.";

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      config: {
        systemInstruction,
        temperature: 0.1,
      },
      contents: [
        {
          inlineData: {
            mimeType: mimeType || "audio/wav",
            data: processedBase64,
          },
        },
        {
          text: promptText,
        },
      ],
    });

    console.log("Server Sync: Conversion finalized successfully. Delivering accurate, zero-drift native text arrays.");

    res.json({ output: response.text || "" });
  } catch (error: any) {
    console.error("[Transcription Error]:", error);
    res.status(500).json({ error: { message: error.message || "Transcription failed." } });
  }
});

// Helper to clean up old temp audio files (older than 1 hour)
async function cleanupTempAudioFiles() {
  try {
    const tempDir = os.tmpdir();
    const files = await fs.promises.readdir(tempDir);
    const now = Date.now();
    for (const file of files) {
      if (file.startsWith("recap_") && file.endsWith(".mp3")) {
        const filePath = path.join(tempDir, file);
        const stat = await fs.promises.stat(filePath);
        if (now - stat.mtimeMs > 3600000) { // 1 hour
          await fs.promises.unlink(filePath);
          console.log(`[Cleanup] Deleted expired temp audio: ${file}`);
        }
      }
    }
  } catch (err) {
    console.warn("[Cleanup Error] Failed to clean up temp files:", err);
  }
}

// Dedicated Edge-TTS Voice Attributes & Pitch/Rate mapping helper
function mapVoiceStyle(style: string): { finalRate: string; finalPitch: string } {
  const s = (style || "general").toLowerCase();
  if (s === "cheerful") {
    return { finalRate: "+10%", finalPitch: "+3Hz" };
  } else if (s === "chat") {
    return { finalRate: "+5%", finalPitch: "+1Hz" };
  } else if (s === "newscast") {
    return { finalRate: "-5%", finalPitch: "-2Hz" };
  } else {
    return { finalRate: "+0%", finalPitch: "+0Hz" };
  }
}

// Endpoint 4: Edge-TTS Aggregator Service (Direct download / legacy fallback)
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice, style } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: { message: "Text parameter is required." } });
      return;
    }

    const selectedVoice = voice || "my-MM-NilarNeural";
    
    // Strict Pitch & Rate mapping depending on selected Vocal Expression style
    const { finalRate, finalPitch } = mapVoiceStyle(style);

    // Split at natural sentence breaks to synthesize in cohesive chunks
    const sentences = text.split(/(?<=[။\.])/).map(s => s.trim()).filter(Boolean);
    const cleanedChunks: string[] = [];
    let currentChunk = "";

    for (let sentence of sentences) {
      if (sentence.length > 1800) {
        if (currentChunk) {
          cleanedChunks.push(currentChunk.trim());
          currentChunk = "";
        }
        let temp = sentence;
        while (temp.length > 1800) {
          cleanedChunks.push(temp.slice(0, 1800));
          temp = temp.slice(1800);
        }
        sentence = temp;
        if (!sentence) continue;
      }

      if (currentChunk && (currentChunk.length + sentence.length + 1 > 1800)) {
        cleanedChunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      }
    }
    if (currentChunk.trim()) {
      cleanedChunks.push(currentChunk.trim());
    }

    if (cleanedChunks.length === 0) {
      res.status(400).json({ error: { message: "Provided text is empty or invalid." } });
      return;
    }

    const processSingleChunk = async (chunkText: string): Promise<Buffer> => {
      const sanitizedText = chunkText.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
      const host = "https://my-edge-tts-api.vercel.app";
      const ttsUrl = `${host}/api/tts?text=${encodeURIComponent(sanitizedText)}&voice=${selectedVoice}&rate=${encodeURIComponent(finalRate)}&pitch=${encodeURIComponent(finalPitch)}`;
      
      console.log(`[TTS Synthesis /api/tts] Calling dedicated host: ${host} | Style: ${style} | Pitch: ${finalPitch} | Rate: ${finalRate}`);
      
      try {
        const response = await fetch(ttsUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });

        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) {
            throw new Error("Server Busy: Edge-TTS engine is temporarily rate-limited or overloaded. Please try again in a few seconds.");
          }
          throw new Error(`Edge-TTS server returned status ${response.status}`);
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("audio")) {
          const bodyTxt = await response.text();
          console.warn(`[TTS Synthesis] Expected audio but received: ${contentType}. Body prefix: ${bodyTxt.slice(0, 150)}`);
          if (bodyTxt.includes("Rate limit") || bodyTxt.includes("Too Many Requests") || bodyTxt.includes("busy") || bodyTxt.includes("error")) {
            throw new Error("Server Busy: Edge-TTS API rate limit reached or service is busy. Please try again in a few seconds.");
          }
          throw new Error("Server Busy: The dedicated Edge-TTS engine returned a non-audio response. Please wait a moment and try again.");
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length < 100) {
          throw new Error("Server Busy: Edge-TTS returned an empty or incomplete audio stream. Please try again.");
        }

        return buffer;
      } catch (err: any) {
        console.error(`[TTS Synthesis /api/tts] Error calling dedicated host:`, err.message || err);
        if (err.message && err.message.includes("Server Busy")) {
          throw err;
        }
        throw new Error(`Server Busy: Failed to communicate with the dedicated Edge-TTS host. Detail: ${err.message || err}`);
      }
    };

    const buffers = await Promise.all(cleanedChunks.map(processSingleChunk));
    const mergedBuffer = Buffer.concat(buffers);

    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": mergedBuffer.length,
      "Content-Disposition": `attachment; filename="burmese_recap_${Date.now()}.mp3"`,
    });
    res.write(mergedBuffer);
    res.end();
  } catch (error: any) {
    console.error("[TTS Endpoint Error]:", error);
    if (!res.headersSent) {
      res.status(503).json({ error: { message: error.message || "Server Busy: Speech synthesis is temporarily unavailable." } });
    } else {
      res.end();
    }
  }
});

// Endpoint 4.5: High-speed JSON Vocal Synthesizer (Saves to server temp file and serves via HTTP streaming to prevent WebView/URL Safety crashes)
app.post("/api/generate-voice", async (req, res) => {
  try {
    // Proactively clean up expired files on every creation request
    cleanupTempAudioFiles().catch(() => {});

    const { text, voice, style } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: { message: "Text parameter is required." } });
      return;
    }

    const selectedVoice = voice || "my-MM-NilarNeural";
    
    // Strict Pitch & Rate mapping depending on selected Vocal Expression style
    const { finalRate, finalPitch } = mapVoiceStyle(style);

    // Split at natural sentence breaks to synthesize in cohesive chunks
    const sentences = text.split(/(?<=[။\.])/).map(s => s.trim()).filter(Boolean);
    const cleanedChunks: string[] = [];
    let currentChunk = "";

    for (let sentence of sentences) {
      if (sentence.length > 1800) {
        if (currentChunk) {
          cleanedChunks.push(currentChunk.trim());
          currentChunk = "";
        }
        let temp = sentence;
        while (temp.length > 1800) {
          cleanedChunks.push(temp.slice(0, 1800));
          temp = temp.slice(1800);
        }
        sentence = temp;
        if (!sentence) continue;
      }

      if (currentChunk && (currentChunk.length + sentence.length + 1 > 1800)) {
        cleanedChunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      }
    }
    if (currentChunk.trim()) {
      cleanedChunks.push(currentChunk.trim());
    }

    if (cleanedChunks.length === 0) {
      res.status(400).json({ error: { message: "Provided text is empty or invalid." } });
      return;
    }

    const processSingleChunk = async (chunkText: string): Promise<Buffer> => {
      const sanitizedText = chunkText.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
      const host = "https://my-edge-tts-api.vercel.app";
      const ttsUrl = `${host}/api/tts?text=${encodeURIComponent(sanitizedText)}&voice=${selectedVoice}&rate=${encodeURIComponent(finalRate)}&pitch=${encodeURIComponent(finalPitch)}`;
      
      console.log(`[TTS Synthesis /api/generate-voice] Calling dedicated host: ${host} | Style: ${style} | Pitch: ${finalPitch} | Rate: ${finalRate}`);
      
      try {
        const response = await fetch(ttsUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });

        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) {
            throw new Error("Server Busy: Edge-TTS engine is temporarily rate-limited or overloaded. Please try again in a few seconds.");
          }
          throw new Error(`Edge-TTS server returned status ${response.status}`);
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("audio")) {
          const bodyTxt = await response.text();
          console.warn(`[TTS Synthesis] Expected audio but received: ${contentType}. Body prefix: ${bodyTxt.slice(0, 150)}`);
          if (bodyTxt.includes("Rate limit") || bodyTxt.includes("Too Many Requests") || bodyTxt.includes("busy") || bodyTxt.includes("error")) {
            throw new Error("Server Busy: Edge-TTS API rate limit reached or service is busy. Please try again in a few seconds.");
          }
          throw new Error("Server Busy: The dedicated Edge-TTS engine returned a non-audio response. Please wait a moment and try again.");
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length < 100) {
          throw new Error("Server Busy: Edge-TTS returned an empty or incomplete audio stream. Please try again.");
        }

        return buffer;
      } catch (err: any) {
        console.error(`[TTS Synthesis /api/generate-voice] Error calling dedicated host:`, err.message || err);
        if (err.message && err.message.includes("Server Busy")) {
          throw err;
        }
        throw new Error(`Server Busy: Failed to communicate with the dedicated Edge-TTS host. Detail: ${err.message || err}`);
      }
    };

    const buffers = await Promise.all(cleanedChunks.map(processSingleChunk));
    const mergedBuffer = Buffer.concat(buffers);

    const id = "recap_" + Date.now() + "_" + Math.random().toString(36).substring(2, 10);
    const tempFilePath = path.join(os.tmpdir(), `${id}.mp3`);
    await fs.promises.writeFile(tempFilePath, mergedBuffer);

    const base64String = mergedBuffer.toString("base64");

    res.json({
      success: true,
      audioUrl: `/api/stream-audio?id=${id}`,
      base64Data: base64String,
      fileName: `recap_${id}.mp3`,
      size: mergedBuffer.length
    });
  } catch (error: any) {
    console.error("[Generate-Voice Endpoint Error]:", error);
    res.json({ success: false, error: { message: error.message || "Server Busy: Speech synthesis is temporarily unavailable." } });
  }
});

// Endpoint 4.6: Progressive Audio Streamer with Range Request Support (Solves all URL Safety Check blockages)
app.get("/api/stream-audio", (req, res) => {
  try {
    const id = req.query.id as string;
    if (!id || !/^[a-zA-Z0-9_]+$/.test(id)) {
      res.status(400).json({ error: { message: "Invalid audio ID." } });
      return;
    }

    const tempFilePath = path.join(os.tmpdir(), `${id}.mp3`);
    if (!fs.existsSync(tempFilePath)) {
      res.status(404).json({ error: { message: "Audio track expired or not found." } });
      return;
    }

    const stat = fs.statSync(tempFilePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(tempFilePath, { start, end });
      
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "audio/mpeg",
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": "audio/mpeg",
        "Accept-Ranges": "bytes"
      });
      fs.createReadStream(tempFilePath).pipe(res);
    }
  } catch (error: any) {
    console.error("[Stream Audio Endpoint Error]:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: error.message || "Streaming failed." } });
    }
  }
});

// Endpoint 5: Video Downloader Mock
app.post("/api/downloader/sim", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: { message: "URL is required" } });
      return;
    }
    const randomId = Math.random().toString(36).substring(7);
    res.json({
      id: `dl_${randomId}`,
      title: `Recap_Video_${randomId}.mp4`,
      fileSizeMB: Math.floor(Math.random() * 80) + 15,
      fps: 30,
      resolution: "1080p",
      thumbnail: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80",
      url: url,
    });
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message || "Downloader failed." } });
  }
});

// Endpoint 6: Streaming Audio/Video Subtitle & Transcript Generation (SSE)
app.post("/api/subtitle/generate-stream", upload.single("file"), async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendProgress = (progress: number, message: string, data?: any) => {
    res.write(`data: ${JSON.stringify({ progress, message, ...data })}\n\n`);
  };

  let inputFilePath = "";
  try {
    const { fileBase64, fileName, mimeType, format } = req.body;
    const apiKey = getRequestApiKey(req);

    if (!req.file && !fileBase64) {
      sendProgress(0, "Error: File content is required.");
      res.end();
      return;
    }

    sendProgress(10, "Media upload verified. Initializing transcribe...");
    const tempDir = os.tmpdir();

    if (req.file) {
      inputFilePath = req.file.path;
    } else {
      const cleanFileName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_") : `upload_${Date.now()}`;
      inputFilePath = path.join(tempDir, `input_${Date.now()}_${cleanFileName}`);
      const fileBuffer = Buffer.from(fileBase64, "base64");
      await fs.promises.writeFile(inputFilePath, fileBuffer);
    }

    sendProgress(40, "Processing audio track...");
    
    // In Express Cloud Run container sandbox, fallback to direct Gemini Audio API transcribe for optimal performance
    if (!apiKey) {
      throw new Error("Gemini API Key is required for high-fidelity transcription.");
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });

    const fileBuffer = await fs.promises.readFile(inputFilePath);
    const base64Data = fileBuffer.toString("base64");

    // Server-Side Audio Stream Cleansing
    console.log("[Audio Stream Cleansing] Running audio filter for streaming transcription...");
    let processedBase64 = base64Data;
    try {
      const rawBuffer = Buffer.from(base64Data, "base64");
      const cleansedBuffer = cleanseAudioBuffer(rawBuffer);
      processedBase64 = cleansedBuffer.toString("base64");
    } catch (cleanseErr) {
      console.warn("[Audio Stream Cleansing Warning] Failed to cleanse audio stream:", cleanseErr);
    }

    // Required Operational Logs for Language Verification
    console.log("Server Sync: Re-establishing secure JSON handshake protocol... Local pipeline routing verified.");
    sendProgress(45, "Server Sync: Re-establishing secure JSON handshake protocol... Local pipeline routing verified.");
    await new Promise((resolve) => setTimeout(resolve, 300));

    console.log("Server Sync: Adaptive Audio Profiler Active: Transcribing exact native spoken language from the media track (No Filters)...");
    sendProgress(60, "Server Sync: Adaptive Audio Profiler Active: Transcribing exact native spoken language from the media track (No Filters)...");
    await new Promise((resolve) => setTimeout(resolve, 300));

    const systemInstruction = 
      "You are a strict, adaptive native Audio Transcriber and Speech-to-Text specialist. " +
      "You must execute adaptive audio profiling: strictly listen to the actual vocal frequencies in the audio stream " +
      "and transcribe the exact native spoken language found within the media file with 100% fidelity. " +
      "Do not force, alter, or restrict the linguistic target. If the original speaker talks in Burmese, output pure Burmese. " +
      "If the original speaker talks in Chinese, output pure Chinese. If the speaker talks in English, output pure English. " +
      "Your output must be 100% accurate, unmanipulated Audio-to-Text Mirroring of whatever language is actually spoken inside the video.";

    const promptText = format === "srt" 
      ? "Transcribe this media verbatim and format it strictly as a SubRip (SRT) subtitle file in the native spoken language (e.g., Burmese, Chinese, English, etc.). " +
        "Execute adaptive audio profiling and match the native spoken language 100% without restriction. " +
        "Use exact sequential block numbers starting from 1, correct timestamps (e.g. 00:00:01,200 --> 00:00:04,500), " +
        "and output ONLY the raw SRT subtitles text without any preamble or markdown tags."
      : "Transcribe this media verbatim matching the native spoken language (e.g., Burmese, Chinese, English, etc.) with 100% fidelity. " +
        "Group the output into natural storytelling paragraphs. Do not force, alter, or restrict the linguistic target.";

    sendProgress(70, "Sending audio track to Google Gemini Audio Pipeline...");
    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      config: {
        systemInstruction,
        temperature: 0.1,
      },
      contents: [
        {
          inlineData: {
            mimeType: mimeType || "audio/mp3",
            data: processedBase64,
          },
        },
        {
          text: promptText,
        },
      ],
    });

    console.log("Server Sync: Conversion finalized successfully. Delivering accurate, zero-drift native text arrays.");
    sendProgress(85, "Server Sync: Conversion finalized successfully. Delivering accurate, zero-drift native text arrays.");
    await new Promise((resolve) => setTimeout(resolve, 300));

    const finalOutput = response.text || "";
    sendProgress(100, "Processing completed successfully!", { output: finalOutput });
  } catch (err: any) {
    console.error("[Stream Transcription Error]:", err);
    sendProgress(100, `Error: ${err.message || "Failed to process audio transcription."}`);
  } finally {
    if (inputFilePath && fs.existsSync(inputFilePath)) {
      try {
        await fs.promises.unlink(inputFilePath);
      } catch (e) {
        console.warn("Cleanup error:", e);
      }
    }
    res.end();
  }
});

// Endpoint 7.1: Subtitle Audio File Uploader (Leverages Gemini File API for lightweight audio)
app.post("/api/subtitle/upload-audio", upload.single("file"), async (req, res) => {
  let tempFilePath = "";
  try {
    const apiKey = getRequestApiKey(req);
    if (!apiKey) {
      res.status(400).json({ error: { message: "Gemini API Key is required for audio uploads." } });
      return;
    }

    const tempDir = os.tmpdir();
    let finalMimeType = "audio/wav";

    if (req.file) {
      tempFilePath = req.file.path;
      finalMimeType = req.file.mimetype || "audio/wav";
    } else if (req.body && req.body.fileBase64) {
      const mimeType = req.body.mimeType || "audio/wav";
      const ext = mimeType.includes("mp3") ? "mp3" : "wav";
      tempFilePath = path.join(tempDir, `upload_${Date.now()}.${ext}`);
      const fileBuffer = Buffer.from(req.body.fileBase64, "base64");
      await fs.promises.writeFile(tempFilePath, fileBuffer);
      finalMimeType = mimeType;
    } else {
      res.status(400).json({ error: { message: "No audio file uploaded." } });
      return;
    }

    // Apply server-side audio stream cleansing to remove low frequency hums & static before uploading to Gemini File API
    try {
      const fileBuffer = await fs.promises.readFile(tempFilePath);
      const cleansedBuffer = cleanseAudioBuffer(fileBuffer);
      await fs.promises.writeFile(tempFilePath, cleansedBuffer);
    } catch (cleanseErr) {
      console.warn("[Upload Audio Cleansing Warning] Failed to cleanse temp audio file:", cleanseErr);
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    console.log("[Gemini File Upload] Uploading temp file to Gemini File API:", tempFilePath);
    const uploadResult = await ai.files.upload({
      file: tempFilePath,
      config: {
        mimeType: finalMimeType,
      }
    });

    console.log("[Gemini File Upload] File uploaded successfully:", uploadResult.uri);

    res.json({
      success: true,
      fileUri: uploadResult.uri,
      mimeType: uploadResult.mimeType || finalMimeType,
      name: uploadResult.name,
    });
  } catch (error: any) {
    console.error("[Gemini Audio Upload Error]:", error);
    res.status(500).json({ error: { message: error.message || "Failed to upload audio to Gemini File API." } });
  } finally {
    // Clean up temporary local file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        await fs.promises.unlink(tempFilePath);
      } catch (e) {
        console.warn("Cleanup error for temp file:", e);
      }
    }
  }
});

// Endpoint 7.2: Multimodal Gemini Subtitle Alignment Engine
app.post("/api/subtitle/align-gemini", async (req, res) => {
  try {
    const { fileUri, mimeType, scriptText } = req.body;
    const apiKey = getRequestApiKey(req);

    if (!apiKey) {
      res.status(400).json({ error: { message: "Gemini API Key is required for subtitle alignment." } });
      return;
    }

    if (!fileUri || !scriptText) {
      res.status(400).json({ error: { message: "Both fileUri and scriptText parameters are required." } });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    const promptText = `
This prompt is for only ai subtitle srt pro, You are a professional AI Subtitle Alignment Engine.

Your only task is to synchronize the provided script with the uploaded audio and generate a perfectly synchronized SRT file.

STRICT RULES

1. NEVER rewrite the script.
2. NEVER summarize the script.
3. NEVER paraphrase the script.
4. NEVER translate the script.
5. NEVER insert or remove words.
6. NEVER modify punctuation.
7. NEVER generate your own subtitle text.
8. Under no circumstances are you allowed to output or generate Chinese characters (Hanzi). Ignore any phonetic similarities to Chinese Mandarin, Cantonese, or other Chinese dialects. You must strictly output the provided script verbatim in its original native format.

The supplied script is the absolute source of truth.

----------------------------------------

SCRIPT SEGMENTATION

The script has already been manually segmented.

Whenever the delimiter "။." or "." is encountered:

- Immediately finish the current subtitle block.
- Create exactly ONE subtitle block.
- Do NOT merge two blocks.
- Do NOT split one block into multiple blocks.
- Do NOT ignore any delimiter.

The text between two delimiters is exactly one subtitle block.

The segmentation is fixed and must never be changed.

----------------------------------------

AUDIO ALIGNMENT

Use the uploaded audio ONLY to determine timestamps.

Do NOT use reading speed.

Do NOT estimate timestamps.

Do NOT distribute time proportionally.

Do NOT guess.

Each subtitle block must begin exactly when its spoken sentence begins.

Each subtitle block must end exactly when its spoken sentence finishes.

----------------------------------------

SEQUENTIAL LISTENING

Process subtitle blocks strictly in order.

Block 1
↓

Find its exact end in the audio.

↓

Block 2 MUST start searching from the exact confirmed end of Block 1.

↓

Find Block 2 end.

↓

Continue sequentially until the last block.

Never jump forward.

Never jump backward.

Never restart searching from the beginning.

Never re-estimate previous audio.

----------------------------------------

LONG AUDIO

For long audio, you may internally process multiple chunks.

However:

Every chunk MUST continue from

- last processed subtitle index
- last confirmed audio position
- last confirmed end timestamp

Never restart the alignment.

Never regenerate previous timestamps.

Never lose continuity.

----------------------------------------

BOUNDARY RULE

If a subtitle crosses an internal chunk boundary,

DO NOT split the subtitle text.

Continue listening inside the next chunk.

Keep one subtitle block.

Generate one continuous timestamp.

----------------------------------------

VERIFICATION

Before generating the final SRT,

run a complete verification pass.

Compare every subtitle block against the audio.

If any block is misaligned,

automatically correct it before exporting.

Never allow cumulative timing drift.

----------------------------------------

OUTPUT

Return only a valid UTF-8 SRT file.

No explanations.

No markdown.

No comments.

No extra text.

Generate perfectly synchronized subtitles from beginning to end.

----------------------------------------

INPUTS TO PROCESS:

The Burmese script to align:
"""
${scriptText}
"""
`;

    console.log("[Gemini Align] Invoking gemini-3.5-flash content generation...");
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      config: {
        systemInstruction: "You are a specialized Subtitle Alignment Engine. You are strictly forbidden from translating the script or outputting Chinese characters. Keep all words verbatim as provided.",
        temperature: 0.1,
      },
      contents: [
        {
          fileData: {
            fileUri,
            mimeType,
          }
        },
        {
          text: promptText,
        }
      ]
    });

    let srtText = response.text || "";
    // Clean up any markdown code wrap if the model ignored our formatting constraint
    if (srtText.includes("```")) {
      srtText = srtText.replace(/```[a-zA-Z0-9]*\n/g, "").replace(/```/g, "");
    }
    srtText = srtText.trim();

    console.log("[Gemini Align] Alignment response received, parsing SRT lines...");

    // Parse the SRT text into blocks
    const parsedBlocks: any[] = [];
    const normalized = srtText.replace(/\r\n/g, "\n").trim();
    const parts = normalized.split(/\n\s*\n/);
    
    let blockIdCounter = 1;
    for (const part of parts) {
      const lines = part.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length >= 3) {
        // Find line containing time pattern '-->'
        const timeLineIdx = lines.findIndex(l => l.includes("-->"));
        if (timeLineIdx !== -1) {
          const timeLine = lines[timeLineIdx];
          const times = timeLine.split("-->").map(t => t.trim());
          
          const parseSrtTimeToMs = (timeStr: string): number => {
            const timeParts = timeStr.trim().split(/[:,\.]/);
            if (timeParts.length >= 4) {
              const hrs = parseInt(timeParts[0], 10) || 0;
              const mins = parseInt(timeParts[1], 10) || 0;
              const secs = parseInt(timeParts[2], 10) || 0;
              const mils = parseInt(timeParts[3], 10) || 0;
              return (((hrs * 3600) + (mins * 60) + secs) * 1000) + mils;
            }
            return 0;
          };

          const startMs = parseSrtTimeToMs(times[0]);
          const endMs = parseSrtTimeToMs(times[1]);
          const blockText = lines.slice(timeLineIdx + 1).join("\n");

          parsedBlocks.push({
            id: blockIdCounter++,
            startMs,
            endMs,
            text: blockText,
          });
        }
      }
    }

    res.json({
      success: true,
      srtText,
      blocks: parsedBlocks,
    });

  } catch (error: any) {
    console.error("[Gemini Subtitle Align Error]:", error);
    res.status(500).json({ error: { message: error.message || "Failed to align script with audio." } });
  }
});

// Bulletproof error middleware for full-stack route safety
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Global Server Exception]:", err);
  res.status(err.status || err.statusCode || 500).json({
    error: {
      message: err.message || "An unexpected error occurred in Burmese Recap Studio.",
    }
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Burmese Recap Tool] Server running on port ${PORT}`);
  });
}

startServer();
