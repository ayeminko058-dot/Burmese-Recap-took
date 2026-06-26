import React, { useState, useEffect, useRef } from "react";
import { 
  FileAudio, FileVideo, Mic, Loader2, Play, 
  Copy, Check, Download, AlertCircle, ShieldCheck, 
  Sparkles, CheckCircle2, Trash2, Key, RefreshCw, Eye, EyeOff, Share2, HelpCircle
} from "lucide-react";
import { triggerInterstitialAd } from "../utils/admob";
import { getApiUrl, safeFetch } from "../utils/api";
import { DownloadTask } from "../types";

interface VideoDownloaderProps {
  onAddNotification: (title: string, message: string, type: "info" | "success" | "warning") => void;
  tasks?: DownloadTask[];
  setTasks?: React.Dispatch<React.SetStateAction<DownloadTask[]>>;
  onAddDownloadedFile?: (name: string, data: string, type: "srt" | "audio" | "video", audioUrl?: string, url?: string) => void;
  onQuickAccessSettings?: () => void;
}

export default function VideoDownloader({ 
  onAddNotification, 
  onAddDownloadedFile,
  onQuickAccessSettings
}: VideoDownloaderProps) {
  
  // Local API Key management states
  const [apiKey, setApiKey] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [apiKeySet, setApiKeySet] = useState<boolean>(false);
  const [keyValidationStatus, setKeyValidationStatus] = useState<"idle" | "validating" | "valid" | "unconfigured" | "invalid">("idle");
  const [validationError, setValidationError] = useState<string | null>(null);

  // File states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDetails, setFileDetails] = useState<{
    name: string;
    size: string;
    type: "audio" | "video";
    durationStr: string;
    durationSecs: number;
    rawType: string;
  } | null>(null);

  // Transcription states
  const [status, setStatus] = useState<"idle" | "extracting_audio" | "transcribing" | "completed" | "error">("idle");
  const [progress, setProgress] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"transcript" | "srt">("transcript");
  const [plainTranscript, setPlainTranscript] = useState<string>("");
  const [srtSubtitles, setSrtSubtitles] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [backendStatusMsg, setBackendStatusMsg] = useState<string>("");

  // Drag and Drop interaction state
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load API Key from local storage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key") || "";
    setApiKey(savedKey);
    setApiKeySet(!!savedKey);
    if (savedKey) {
      setKeyValidationStatus("valid"); // Assume valid initially, user can re-validate
    } else {
      setKeyValidationStatus("unconfigured");
    }
  }, []);

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      onAddNotification("API Key Required", "Please enter a valid Gemini API Key first.", "warning");
      return;
    }
    localStorage.setItem("gemini_api_key", apiKey.trim());
    setApiKeySet(true);
    setKeyValidationStatus("idle");
    onAddNotification("API Key Saved", "Gemini API Key saved securely in your local browser storage.", "success");
    
    // Dispatch an event to notify sibling components (like Translator) that API key has changed
    window.dispatchEvent(new Event("storage"));
  };

  const handleClearApiKey = () => {
    localStorage.removeItem("gemini_api_key");
    setApiKey("");
    setApiKeySet(false);
    setKeyValidationStatus("unconfigured");
    setValidationError(null);
    onAddNotification("Key Removed", "Gemini API Key purged from local storage.", "warning");
    
    // Dispatch event
    window.dispatchEvent(new Event("storage"));
  };

  const handleValidateApiKey = async () => {
    const keyToValidate = apiKey.trim();
    if (!keyToValidate) {
      onAddNotification("Input Required", "Please enter or paste an API key to validate.", "warning");
      return;
    }

    setKeyValidationStatus("validating");
    setValidationError(null);

    try {
      const response = await safeFetch(getApiUrl("/api/validate-key"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gemini-API-Key": keyToValidate,
        },
      });

      const contentType = response.headers.get("content-type");
      let data: any = {};
      
      if (contentType && contentType.includes("application/json")) {
        data = await response.json().catch(() => ({}));
      } else {
        const rawText = await response.text().catch(() => "");
        if (rawText.includes("Unexpected token") || rawText.includes("504") || rawText.includes("timeout") || rawText.startsWith("T") || rawText.includes("Gateway")) {
          throw new Error("တောင်းဆိုမှု ကြာမြင့်နေပါသည်။ ခဏအကြာမှ ပြန်လည်ကြိုးစားပေးပါ။");
        }
        throw new Error(rawText.substring(0, 100) || "Server network error.");
      }

      if (response.ok && data.valid) {
        setKeyValidationStatus("valid");
        onAddNotification("Validation Success", "Gemini API Key is valid and working!", "success");
      } else {
        setKeyValidationStatus("invalid");
        setValidationError(data.error || "The key appears to be invalid or unsupported.");
        onAddNotification("Validation Failed", "Google rejected the requested key credentials.", "warning");
      }
    } catch (err: any) {
      console.error(err);
      setKeyValidationStatus("invalid");
      setValidationError(err.message || "Failed to establish validation handshake with the server.");
      onAddNotification("Network Error", "Handshake validation failed.", "warning");
    }
  };

  // Helper functions for Web Audio extraction & resampling down to 16kHz WAV
  const encodeMonoFloat32ToWav = (samples: Float32Array, sampleRate: number): Blob => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    
    const writeString = (v: DataView, offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        v.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    const floatTo16BitPCM = (v: DataView, offset: number, input: Float32Array) => {
      for (let i = 0; i < input.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, input[i]));
        v.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
    };

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* file length */
    view.setUint32(4, 36 + samples.length * 2, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (PCM) */
    view.setUint16(20, 1, true);
    /* channel count (mono) */
    view.setUint16(22, 1, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * 2, true);
    /* block align */
    view.setUint16(32, 2, true);
    /* bits per sample */
    view.setUint16(34, 16, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, samples.length * 2, true);
    
    floatTo16BitPCM(view, 44, samples);
    
    return new Blob([view], { type: 'audio/wav' });
  };

  // Process selected file
  const processSelectedFile = (file: File) => {
    const extension = file.name.substring(file.name.lastIndexOf(".") + 1).toLowerCase();
    const isAudio = ["mp3", "wav", "m4a", "aac"].includes(extension) || file.type.startsWith("audio/");
    const isVideo = ["mp4", "mov", "mkv", "webm"].includes(extension) || file.type.startsWith("video/");

    if (!isAudio && !isVideo) {
      onAddNotification(
        "Supported Files Only", 
        "Selected format is not supported. Please pick a valid audio or video file.", 
        "warning"
      );
      return;
    }

    const sizeStr = (file.size / (1024 * 1024)).toFixed(2) + " MB";
    setSelectedFile(file);
    setFileDetails({
      name: file.name,
      size: sizeStr,
      type: isVideo ? "video" : "audio",
      durationStr: "Calculating...",
      durationSecs: 0,
      rawType: file.type || `media/${extension}`
    });

    setPlainTranscript("");
    setSrtSubtitles("");
    setErrorMsg(null);
    setStatus("idle");
    setProgress(0);

    // Get exact media duration using temporary element
    try {
      const url = URL.createObjectURL(file);
      const mediaEl = document.createElement(isVideo ? "video" : "audio");
      mediaEl.src = url;
      mediaEl.onloadedmetadata = () => {
        const d = mediaEl.duration;
        const mins = Math.floor(d / 60);
        const secs = Math.floor(d % 60);
        setFileDetails(prev => prev ? {
          ...prev,
          durationStr: `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`,
          durationSecs: Math.max(1, Math.ceil(d))
        } : null);
        URL.revokeObjectURL(url);
      };
      
      mediaEl.onerror = () => {
        setFileDetails(prev => prev ? {
          ...prev,
          durationStr: "Unknown",
          durationSecs: 0
        } : null);
        URL.revokeObjectURL(url);
      };
    } catch (e) {
      console.warn("Duration lookup error:", e);
    }

    onAddNotification("File Loaded", `Successfully mounted "${file.name}" for local conversion.`, "success");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  // Convert files to base64 helper (unused now, but kept for compatibility)
  const convertBlobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const resultStr = reader.result as string;
        const base64Data = resultStr.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Extract audio track locally from media file and downsample to 16kHz WAV
  const extractAudioTrack = async (file: File): Promise<Blob> => {
    const arrayBuffer = await file.arrayBuffer();
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (decodeErr) {
      console.error("AudioContext.decodeAudioData failed, trying fallback:", decodeErr);
      await audioCtx.close();
      throw new Error("Could not decode audio data from this file. Verify that it is a valid, uncorrupted media file.");
    }
    
    const targetSampleRate = 16000;
    const numberOfChannels = 1;
    const duration = audioBuffer.duration;
    
    // Cap maximum duration to 15 minutes to prevent out-of-memory or browser slowness on massive video files
    const maxDuration = 900;
    const finalDuration = Math.min(duration, maxDuration);
    const totalSamples = Math.floor(finalDuration * targetSampleRate);
    
    const offlineCtx = new OfflineAudioContext(numberOfChannels, totalSamples, targetSampleRate);
    
    const bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(offlineCtx.destination);
    bufferSource.start(0, 0, finalDuration);
    
    const renderedBuffer = await offlineCtx.startRendering();
    const monoSamples = renderedBuffer.getChannelData(0);
    
    const wavBlob = encodeMonoFloat32ToWav(monoSamples, targetSampleRate);
    await audioCtx.close();
    return wavBlob;
  };

  // Transcribe process
  const triggerTranscription = async (formatSelection: "txt" | "srt") => {
    if (!selectedFile) {
      onAddNotification("File Required", "Please select an audio or video file first.", "warning");
      return;
    }

    const savedKey = localStorage.getItem("gemini_api_key") || "";
    if (!savedKey) {
      onAddNotification("API Key Missing", "Configure your Gemini API settings to enable speech transcription.", "warning");
      return;
    }

    setStatus("extracting_audio");
    setProgress(5);
    setBackendStatusMsg("Stage 1: Extracting Audio Track locally in browser...");
    setErrorMsg(null);

    try {
      onAddNotification("Extracting Audio", "Running native browser audio engine extraction...", "info");
      
      // Step 1: Local Audio Extraction (highly compressed WAV)
      let audioBlob: Blob;
      try {
        audioBlob = await extractAudioTrack(selectedFile);
        setProgress(35);
        setBackendStatusMsg("Stage 1: Local audio track extracted successfully!");
        onAddNotification("Extraction Successful", "Extracted optimized 16kHz audio track locally.", "success");
      } catch (extractErr: any) {
        console.warn("Local audio extraction failed, falling back to sending original file:", extractErr);
        audioBlob = selectedFile;
        setProgress(20);
        setBackendStatusMsg("Stage 1 (Fallback): Sending original file directly...");
      }

      // Step 2: Direct client-side transcribing with Gemini
      setProgress(45);
      setBackendStatusMsg("Stage 2: Transcribing speech via Direct Gemini API on-device...");
      onAddNotification("Direct Handshake", "Initiating client-side direct audio transcription with Gemini...", "info");

      // Convert audioBlob into base64 format for inline passing
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: savedKey });

      let prompt = "";
      if (formatSelection === "srt") {
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

      setProgress(60);
      setBackendStatusMsg("Stage 2: Gemini is analyzing speech acoustics...");

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [
          {
            inlineData: {
              mimeType: "audio/wav",
              data: base64Data,
            },
          },
          {
            text: prompt,
          },
        ],
      });

      setProgress(85);
      setBackendStatusMsg("Stage 3: Parsing received transcription timelines...");

      let resultText = geminiResponse.text || "";
      
      // Clean markdown wrap blocks if any returned
      if (resultText.includes("```")) {
        resultText = resultText.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
      }

      if (!resultText) {
        throw new Error("No transcription text returned from the direct Gemini pipeline.");
      }

      // Intercept with Interstitial Ad before displaying results to user
      triggerInterstitialAd(
        "ဗီဒီယိုကြော်ငြာတစ်ခုကြည့်ပြီး စာသားအဖြေကို ရယူပါ",
        () => {
          let cleanPlain = "";
          if (formatSelection === "srt") {
            setSrtSubtitles(resultText);
            setActiveTab("srt");
            // Also generate fallback plain text by stripping srt lines
            let strippedText = resultText.replace(/\d+\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\r?\n/g, "").replace(/\r?\n\r?\n/g, "\n");
            // Strip brackets, timelines, and loose timestamps like 00:00, 00:15, etc.
            strippedText = strippedText.replace(/\[\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\]/g, "");
            strippedText = strippedText.replace(/\(\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\)/g, "");
            strippedText = strippedText.replace(/\b\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\b/g, "");
            strippedText = strippedText.replace(/\[\s*\]/g, "").replace(/\(\s*\)/g, "");
            strippedText = strippedText.replace(/\s+/g, " ");
            cleanPlain = strippedText.trim();
            setPlainTranscript(cleanPlain);
          } else {
            let cleanedText = resultText;
            // Strip brackets, timelines, and loose timestamps like 00:00, 00:15, etc.
            cleanedText = cleanedText.replace(/\[\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\]/g, "");
            cleanedText = cleanedText.replace(/\(\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\)/g, "");
            cleanedText = cleanedText.replace(/\b\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\b/g, "");
            cleanedText = cleanedText.replace(/\[\s*\]/g, "").replace(/\(\s*\)/g, "");
            cleanedText = cleanedText.replace(/\s+/g, " ");
            
            cleanPlain = cleanedText.trim();
            setPlainTranscript(cleanPlain);
            setActiveTab("transcript");
            // Create an approximate SRT mapping if user selected TXT but clicks SRT later
            const lines = cleanPlain.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
            let approxSrt = "";
            lines.forEach((line: string, idx: number) => {
              const step = 4;
              const startSec = idx * step;
              const endSec = (idx + 1) * step;
              const fmtTime = (s: number) => {
                const h = Math.floor(s / 3600).toString().padStart(2, "0");
                const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
                const sec = Math.floor(s % 60).toString().padStart(2, "0");
                return `${h}:${m}:${sec},000`;
              };
              approxSrt += `${idx + 1}\n${fmtTime(startSec)} --> ${fmtTime(endSec)}\n${line}\n\n`;
            });
            setSrtSubtitles(approxSrt.trim());
          }

          setProgress(100);
          setStatus("completed");
          setBackendStatusMsg("Completed successfully!");
          onAddNotification("Transcription Finished", "Successfully compiled audio text track.", "success");

          // Save into Downloads History
          if (onAddDownloadedFile && selectedFile) {
            const baseName = selectedFile.name.replace(/\.[^/.]+$/, "");
            if (formatSelection === "srt") {
              onAddDownloadedFile(`${baseName}_subtitles.srt`, resultText, "srt");
            } else {
              onAddDownloadedFile(`${baseName}_transcript.txt`, cleanPlain, "srt"); 
            }
          }
        },
        onAddNotification
      );

    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMsg(err.message || "Error occurred during remote pipeline transmission.");
      onAddNotification("Transcription Failed", err.message || "Failed to process audio matrix.", "warning");
    }
  };

  const handleCopyResult = () => {
    const text = activeTab === "transcript" ? plainTranscript : srtSubtitles;
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    onAddNotification("Copied Result", "Transcript copied safely to clipboard.", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadBlob = (ext: "txt" | "srt") => {
    const content = ext === "txt" ? plainTranscript : srtSubtitles;
    if (!content) return;

    try {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const cleanName = selectedFile?.name.replace(/\.[^/.]+$/, "") || "gemini_transcription";
      link.href = url;
      link.download = `${cleanName}_compiled.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      onAddNotification("File Exported", `Successful extraction of standard .${ext.toUpperCase()}`, "success");
    } catch (err) {
      onAddNotification("Download Blocked", "Your device browser restricted instant file saves.", "warning");
    }
  };

  const handleShareResult = async () => {
    const content = activeTab === "transcript" ? plainTranscript : srtSubtitles;
    if (!content) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Gemini Transcription Export",
          text: content.slice(0, 1000),
        });
        onAddNotification("Export complete", "Transcript shared accurately.", "success");
      } catch (e) {
        // Ignored
      }
    } else {
      navigator.clipboard.writeText(content);
      onAddNotification("Copied link", "Share transcript copied directly.", "success");
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setFileDetails(null);
    setStatus("idle");
    setProgress(0);
    setPlainTranscript("");
    setSrtSubtitles("");
    setErrorMsg(null);
  };

  return (
    <div className="flex-1 overflow-y-auto px-2.5 py-3 pb-36 select-none text-left space-y-3" id="offline-transcription-studio">
      
      {/* Header and Branding (Material 3 Card) - Compressed by 33% */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950/45 to-slate-950 p-3 rounded-2xl border border-indigo-500/20 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-500/15 text-indigo-400 rounded-xl border border-indigo-500/20">
            <Mic className="w-4 h-4 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-white tracking-wide">
              Voice to Text (Gemini Edition)
            </h1>
            <p className="text-[8.5px] text-slate-450 mt-0.5">
              Secure Direct Processing • Sub Rip Caption Aligner & Transcription Panel
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1 bg-indigo-500/10 text-indigo-400 text-[8px] uppercase font-mono py-0.5 px-2 rounded-full border border-indigo-500/20">
          <ShieldCheck className="w-3 h-3" />
          <span>Lossless PCM Resampling</span>
        </div>
      </div>

      {/* Required Banner Warning - Compressed */}
      {!apiKeySet && (
        <div className="bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl text-[10px] text-rose-350 flex items-start gap-2 animate-fade-in">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-extrabold text-rose-400">Gemini API Key Required</p>
            <p className="text-[8.5px] text-slate-400 mt-0.5 leading-relaxed">
              This app transcudes and performs audio processing locally on your device before translating and sending standard audio frames to Google's Gemini models for speech-to-text. Please provide your credential below.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* Left Settings & Upload Deck (Grid Column 5) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Dedicated Gemini API key Settings Panel (Embedded securely inside active screen context) */}
          <div className="bg-[#0e1626] border border-slate-800 p-4 rounded-3xl space-y-3 shadow-md">
            <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
              <Key className="w-4 h-4 text-indigo-400" />
              <span>Gemini Credentials Console</span>
            </span>

            <p className="text-[9px] text-slate-400 leading-relaxed font-sans pb-1">
              "Your Gemini API Key is stored locally inside this app on your device only. The app does not upload, store, collect, or save your API key on any external server. Your key is used only to communicate directly with Google's Gemini API."
            </p>

            <div className="space-y-2">
              <div className="bg-slate-950 p-1.5 rounded-2xl border border-slate-800 flex items-center justify-between gap-1.5 home-settings-key-group">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste AI Studio API Key..."
                  className="bg-transparent text-xs text-slate-100 flex-1 px-2.5 outline-none font-mono placeholder-slate-600 focus:ring-0 select-text"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-1.5 hover:bg-slate-905 text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Secure status display lines */}
              <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                <span>Secure Storage Status:</span>
                {apiKeySet ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" /> Stored locally
                  </span>
                ) : (
                  <span className="text-amber-500 font-bold">Not configured</span>
                )}
              </div>

              {/* Buttons deck */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  className="bg-indigo-650 hover:bg-indigo-600 text-white text-[10px] font-bold py-2 rounded-xl transition-colors text-center border border-indigo-500/20 active:scale-95 duration-150"
                >
                  {apiKeySet ? "Update Key" : "Save Key"}
                </button>
                <button
                  type="button"
                  onClick={handleValidateApiKey}
                  disabled={keyValidationStatus === "validating" || !apiKey}
                  className={`border text-[10px] py-1.5 rounded-xl transition-all font-bold flex items-center justify-center gap-1 ${
                    keyValidationStatus === "valid"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-[#0D1321] border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  {keyValidationStatus === "validating" ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  <span>Check Credentials</span>
                </button>
              </div>

              {apiKeySet && (
                <button
                  type="button"
                  onClick={handleClearApiKey}
                  className="w-full text-center text-[9px] text-rose-450 hover:text-rose-400 py-1 font-mono uppercase tracking-wider font-extrabold"
                >
                  Clear Configured Keys
                </button>
              )}

              {validationError && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-2 text-[9px] text-rose-300 rounded-xl leading-relaxed select-text font-mono break-all font-semibold">
                  Error: {validationError}
                </div>
              )}

            </div>
          </div>

          {/* SAF File Picker layout */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => status !== "extracting_audio" && status !== "transcribing" && fileInputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-3xl p-6 text-center transition-all duration-300 flex flex-col items-center justify-center relative min-h-[175px] ${
              isDragging
                ? "bg-indigo-950/20 border-indigo-400 shadow-inner scale-[0.99]"
                : selectedFile 
                ? "bg-slate-900/60 border-indigo-500/30 shadow-inner" 
                : "bg-slate-950/70 border-slate-800/80 hover:border-indigo-500/40 hover:bg-[#111A2E]/30"
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept=".mp3,.wav,.m4a,.aac,.mp4,.mov,.mkv,.webm"
              className="hidden"
              disabled={status === "extracting_audio" || status === "transcribing"}
            />

            {!selectedFile ? (
              <div className="space-y-3 py-1">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/5 text-indigo-400 flex items-center justify-center border border-indigo-400/15 mx-auto">
                  <FileAudio className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-200">Import Media Document</h3>
                  <p className="text-[9px] text-slate-400 mt-1 max-w-[240px] leading-relaxed mx-auto">
                    Select Audio File (MP3/WAV/M4A/AAC) or Video File (MP4/MOV/MKV/WEBM)
                  </p>
                </div>
                <button 
                  type="button"
                  className="bg-indigo-650 hover:bg-indigo-600 text-white text-[9px] font-extrabold py-1.5 px-3.5 rounded-xl transition-all duration-150 active:scale-95 text-center mt-1 block mx-auto"
                >
                  Retrieve local document
                </button>
              </div>
            ) : (
              <div className="w-full text-left space-y-3">
                <div className="flex justify-between items-start select-text">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 shrink-0">
                      {fileDetails?.type === "video" ? <FileVideo className="w-5 h-5 text-indigo-400 animate-pulse" /> : <FileAudio className="w-5 h-5 text-indigo-400" />}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-200 truncate pr-1">{fileDetails?.name}</h4>
                      <p className="text-[9px] text-slate-400 mt-0.5">{fileDetails?.size} • Span: {fileDetails?.durationStr}</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReset();
                    }}
                    className="text-[9px] text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:bg-slate-800 px-2.5 py-1 rounded-lg shrink-0 select-none font-bold"
                  >
                    Clear Filter
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Trigger Buttons */}
          <div className="space-y-2 select-none">
            <button
              onClick={() => triggerTranscription("txt")}
              disabled={status === "extracting_audio" || status === "transcribing" || !selectedFile || !apiKeySet}
              className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider transition-all shadow-md ${
                status === "extracting_audio" || status === "transcribing" || !selectedFile || !apiKeySet
                  ? "bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed"
                  : "bg-indigo-650 hover:bg-indigo-600 text-white border border-indigo-555 duration-150 active:scale-95 cursor-pointer"
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-200" />
              <span>Generate Plain Transcript</span>
            </button>

            <button
              onClick={() => triggerTranscription("srt")}
              disabled={status === "extracting_audio" || status === "transcribing" || !selectedFile || !apiKeySet}
              className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider transition-all shadow-md ${
                status === "extracting_audio" || status === "transcribing" || !selectedFile || !apiKeySet
                  ? "bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed"
                  : "bg-emerald-650 hover:bg-emerald-600 text-white border border-emerald-600 duration-150 active:scale-95 cursor-pointer"
              }`}
            >
              <FileAudio className="w-4 h-4 text-emerald-250 animate-pulse" />
              <span>Generate SRT Subtitles</span>
            </button>
          </div>

        </div>

        {/* Right Processing Dashboard & Subtitle Screen Area */}
        <div className="lg:col-span-7 space-y-4 text-slate-200">
          
          {/* Audio processing / compiling loader overlay */}
          {status !== "idle" && (
            <div className="bg-slate-900/60 p-5 border border-slate-800 rounded-3xl space-y-3.5 relative overflow-hidden select-text text-slate-200 shadow-md">
              <div className="flex justify-between items-center select-none">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-extrabold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                  <span>Interactive Pipeline Metrics</span>
                </span>
                {(status === "extracting_audio" || status === "transcribing") && (
                  <span className="text-[9px] text-indigo-400 font-mono font-extrabold flex items-center gap-1 shrink-0">
                    <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-400" />
                    <span>Synchronizing frames...</span>
                  </span>
                )}
              </div>

              {/* Step indicator description lines */}
              <div className="flex items-center gap-2 text-xs font-semibold leading-relaxed">
                {status === "extracting_audio" && (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-500 shrink-0" />
                    <span className="text-amber-200">
                      {backendStatusMsg || "[Step 1/3]: Decoding array buffers and downsampling PCM matrix..."}
                    </span>
                  </>
                )}
                {status === "transcribing" && (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
                    <span className="text-indigo-200">
                      {backendStatusMsg || "[Step 2/3]: Uploading audio stream securely to Gemini API model..."}
                    </span>
                  </>
                )}
                {status === "completed" && (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-emerald-400 font-bold">[Step 3/3]: Transcription completed perfectly. Output mapped.</span>
                  </>
                )}
                {status === "error" && (
                  <>
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span className="text-rose-450 font-bold">Local Pipeline Aborted</span>
                  </>
                )}
              </div>

              {/* Progress dynamic bars */}
              <div className="space-y-1 select-none">
                <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                  <span>Compilation Engine Status</span>
                  <span className="font-bold text-slate-200">{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      status === "error" ? "bg-rose-500" : "bg-gradient-to-r from-indigo-500 to-emerald-500"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Error messages log panel */}
              {errorMsg && (
                <div className="bg-rose-500/10 border border-rose-505/20 rounded-2xl p-3.5 text-xs text-rose-300 space-y-1 select-text">
                  <p className="font-extrabold flex items-center gap-1.5 text-rose-450 select-none">
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                    <span>Fatal Converter Handshake Interrupted</span>
                  </p>
                  <p className="text-[10px] text-slate-400 tracking-wide font-mono leading-relaxed p-2 bg-black/45 rounded border border-rose-950/40 select-text break-all">
                    {errorMsg}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Results Output Canvas panel (Shows only if content is compiled) */}
          {(plainTranscript || srtSubtitles) ? (
            <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-3xl space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-800/60 select-none animate-fade-in">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  Compiled Transcription Stream
                </span>
                
                {/* Tabs switcher */}
                <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setActiveTab("transcript")}
                    className={`text-[9.5px] px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                      activeTab === "transcript" 
                        ? "bg-indigo-650 text-white shadow-md font-extrabold" 
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Plain text
                  </button>
                  <button
                    onClick={() => setActiveTab("srt")}
                    className={`text-[9.5px] px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                      activeTab === "srt" 
                        ? "bg-indigo-650 text-white shadow-md font-extrabold" 
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    SRT format
                  </button>
                </div>
              </div>

              {/* Dynamic scroll content area */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 max-h-60 overflow-y-auto text-left leading-relaxed shadow-inner">
                {activeTab === "transcript" ? (
                  <div className="text-slate-105 text-[11px] whitespace-pre-wrap font-sans select-all leading-relaxed">
                    {plainTranscript || "Extracting spoken track words..."}
                  </div>
                ) : (
                  <div className="text-slate-300 font-mono text-[10px] whitespace-pre-wrap select-all leading-normal select-text">
                    {srtSubtitles || "Constructing caption timelines..."}
                  </div>
                )}
              </div>

              {/* Trigger tools buttons deck */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800/60 select-none">
                <button
                  onClick={handleCopyResult}
                  className="flex items-center gap-1 bg-slate-850 hover:bg-slate-800 text-slate-200 text-[10px] font-bold py-1.5 px-3.5 rounded-xl transition border border-slate-800 hover:text-white"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Copy Result</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleDownloadBlob("txt")}
                  className="flex items-center gap-1 bg-slate-850 hover:bg-slate-800 text-slate-200 text-[10px] font-bold py-1.5 px-3.5 rounded-xl transition border border-slate-800 hover:text-white"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Download TXT</span>
                </button>

                <button
                  onClick={() => handleDownloadBlob("srt")}
                  className="flex items-center gap-1 bg-indigo-650 hover:bg-indigo-600 text-white text-[10px] font-extrabold py-1.5 px-3.5 rounded-xl transition duration-150 active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download SRT</span>
                </button>

                <button
                  onClick={handleShareResult}
                  className="flex items-center gap-1 bg-slate-850 hover:bg-slate-800 text-slate-200 text-[10px] font-bold py-1.5 px-3.5 rounded-xl transition border border-slate-800"
                >
                  <Share2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Share</span>
                </button>
              </div>

            </div>
          ) : (
            <div className="bg-slate-900/40 border border-slate-800/60 p-8 rounded-3xl text-center flex flex-col items-center justify-center space-y-4 min-h-[220px] select-none text-slate-400">
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 text-slate-500 shadow-md">
                <Mic className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h4 className="text-xs font-bold text-slate-350">Speech Output Hub</h4>
                <p className="text-[10px] leading-relaxed text-slate-500">
                  Import an audio track or movie recap, validate key configurations, and activate the transcriber to start decoding voice.
                </p>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
