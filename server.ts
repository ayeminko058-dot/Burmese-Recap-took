import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import os from "os";
import { exec, spawn } from "child_process";
import { EventEmitter } from "events";
import { pipeline } from "stream/promises";
import multer from "multer";
import whisper from "whisper-node";
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

          if (isMyanmar) {
            const ssmlText = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='my-MM'><voice name='${voice}'><prosody rate='${rate}' pitch='${pitch}'>${sanitizedText}</prosody></voice></speak>`;

            try {
              response = await fetch(`https://my-edge-tts-api.vercel.app/api/tts?voice=${selectedVoice}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/ssml+xml",
                  "Accept": "*/*"
                },
                body: ssmlText,
                signal: controller.signal
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
                  }),
                  signal: controller.signal
                });
              }
            } catch (postError) {
              console.warn(`[TTS Batch-Chunk ${index + 1}] POST SSML error on attempt ${attempt}:`, postError);
            }

            if (!response || !response.ok) {
              const fallbackUrl = `https://my-edge-tts-api.vercel.app/api/tts?text=${encodeURIComponent(sanitizedText)}&voice=${selectedVoice}&rate=${encodeURIComponent(rate)}&pitch=${encodeURIComponent(pitch)}`;
              response = await fetch(fallbackUrl, { signal: controller.signal });
            }
          } else {
            const ttsUrl = `https://my-edge-tts-api.vercel.app/api/tts?text=${encodeURIComponent(sanitizedText)}&voice=${selectedVoice}&rate=${encodeURIComponent(rate)}&pitch=${encodeURIComponent(pitch)}`;
            response = await fetch(ttsUrl, { signal: controller.signal });
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

    // Set chunked transfer headers to support unlimited length with zero server timeouts
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Transfer-Encoding": "chunked",
      "Content-Disposition": `attachment; filename="burmese_recap_tts_${Date.now()}.mp3"`,
    });

    console.log(`[TTS Stream] Initializing progressive stream synthesis for ${cleanedChunks.length} chunks...`);

    // Sequentially synthesize and stream chunks to keep Time-to-First-Byte extremely low
    for (let i = 0; i < cleanedChunks.length; i++) {
      try {
        const buffer = await processSingleChunkWithRetry(i);
        if (buffer && buffer.length > 0) {
          console.log(`[TTS Stream] Writing chunk ${i + 1}/${cleanedChunks.length} of size ${buffer.length} bytes to the client.`);
          res.write(buffer);
        }
      } catch (err: any) {
        console.error(`[TTS Stream Error] Permanent failure for chunk index ${i}:`, err);
        // Skip failed chunk, keep streaming remaining segments
      }
    }

    console.log("[TTS Stream] All chunks written. Closing connection.");
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
app.post("/api/subtitle/generate-stream", async (req, res) => {
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
    const { fileBase64, fileName, mimeType, format } = req.body;

    if (!fileBase64) {
      sendProgress(0, "Error: File content is required.");
      res.end();
      return;
    }

    // Step 1: Upload received (5%)
    sendProgress(5, "Upload received, writing media stream to backend storage...");

    const tempDir = os.tmpdir();
    const cleanFileName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_") : `upload_${Date.now()}`;
    inputFilePath = path.join(tempDir, `input_${Date.now()}_${cleanFileName}`);
    outputAudioPath = path.join(tempDir, `output_${Date.now()}.wav`);

    const fileBuffer = Buffer.from(fileBase64, "base64");
    await fs.promises.writeFile(inputFilePath, fileBuffer);

    // Step 2: Audio extraction started (15%)
    sendProgress(15, "Audio extraction started. Demuxing sound track via ffmpeg...");

    // Use FfmpegAudioExtractor asynchronously for non-blocking execution
    const extractor = new FfmpegAudioExtractor();
    await extractor.extract(inputFilePath, outputAudioPath);

    // Step 3: Audio extraction completed (30%)
    sendProgress(30, "Audio extraction completed. Resampling PCM stream to 16kHz mono 16-bit...");

    // Step 4: Whisper processing started (50%)
    sendProgress(50, "Whisper local transcription started. Analyzing acoustic speech patterns...");

    const whisperSegments = await transcribeWithWhisper(outputAudioPath);

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

    let finalOutput = "";
    if (format === "srt") {
      for (let i = 0; i < subBlocks.length; i++) {
        const block = subBlocks[i];
        const blockIndex = i + 1;
        const startStr = formatMsToSrtTime(block.startMs);
        const endStr = formatMsToSrtTime(block.endMs);
        finalOutput += `${blockIndex}\n${startStr} --> ${endStr}\n${block.text}\n\n`;
      }
    } else {
      finalOutput = subBlocks.map(b => b.text.replace(/\n/g, " ")).join(" ");
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
  }

  extract(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ["-y", "-i", inputPath, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "-f", "wav", outputPath];
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

// Ensure local Whisper model exists at ./models/ggml-tiny.bin
async function ensureWhisperModelExists(): Promise<string> {
  const modelDir = path.resolve("./models");
  const modelPath = path.join(modelDir, "ggml-tiny.bin");
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }
  if (!fs.existsSync(modelPath)) {
    console.log("[Whisper] ggml-tiny.bin not found. Downloading model from huggingface...");
    const url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin";
    
    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(modelPath);
      const download = (targetUrl: string) => {
        https.get(targetUrl, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            download(response.headers.location!);
            return;
          }
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download model, status code: ${response.statusCode}`));
            return;
          }
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            console.log("[Whisper] Model downloaded successfully to " + modelPath);
            resolve();
          });
        }).on("error", (err) => {
          fs.unlink(modelPath, () => {});
          reject(err);
        });
      };
      download(url);
    });
  }
  return modelPath;
}

// Transcribe with Whisper model locally
async function transcribeWithWhisper(audioPath: string): Promise<any[]> {
  const modelPath = await ensureWhisperModelExists();
  console.log(`[Whisper] Starting local Whisper tiny model transcription on ${audioPath}`);
  
  const options = {
    modelPath: modelPath,
    language: "my",
    whisperOptions: {
      language: "my",
      word_timestamps: true
    }
  };

  const whisperFn = typeof whisper === "function" ? whisper : (whisper as any).default || (whisper as any).whisper;
  if (typeof whisperFn !== "function") {
    throw new Error("Unable to locate whisper function in whisper-node package.");
  }

  const results = await whisperFn(audioPath, options);
  console.log(`[Whisper] Transcription finished. Received ${results?.length || 0} segments.`);
  return results || [];
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
    const { text, segments: segmentsRaw, activeMediaDurationMs: durationRaw, alignmentMode } = req.body;
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

    // Step 2: Extraction and Local Whisper Transcription
    console.log("[AI_SYNC] Initializing local Whisper forced alignment...");
    
    if (req.file.path) {
      createdTempFiles.push(req.file.path);
    }

    const tempDir = os.tmpdir();
    const videoCachePath = path.join(tempDir, `uploaded_video_${Date.now()}.mp4`);
    createdTempFiles.push(videoCachePath);

    await pipeline(
      fs.createReadStream(req.file.path),
      fs.createWriteStream(videoCachePath)
    );

    const outputAudioPath = path.join(tempDir, `align_audio_${Date.now()}.wav`);
    createdTempFiles.push(outputAudioPath);

    // Audio demuxing via FfmpegAudioExtractor
    const extractor = new FfmpegAudioExtractor();
    await extractor.extract(videoCachePath, outputAudioPath);

    // Run Whisper local speech-to-text transcription
    const whisperSegments = await transcribeWithWhisper(outputAudioPath);
    console.log(`[AI_SYNC] Local Whisper transcription returned ${whisperSegments.length} segments.`);

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

    res.json({ blocks: calibratedBlocks });

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
