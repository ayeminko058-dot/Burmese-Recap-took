import React, { useState, useEffect } from "react";
import { 
  ImageIcon, Sparkles, Layout, Download, RefreshCw, 
  AlertCircle, Upload, Eye, Check, Type, HelpCircle
} from "lucide-react";

interface PosterMakerStudioProps {
  onAddNotification: (title: string, message: string, type: "info" | "success" | "warning") => void;
}

// Resolution-independent high-fidelity SVG placeholders for instant offline compatibility
const DEFAULT_BG_9_16 = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1080' height='1920' viewBox='0 0 1080 1920'><defs><radialGradient id='g' cx='50%' cy='50%' r='70%'><stop offset='0%' stop-color='%231F2937'/><stop offset='60%' stop-color='%23111827'/><stop offset='100%' stop-color='%23030712'/></radialGradient></defs><rect width='100%' height='100%' fill='url(%23g)'/><circle cx='540' cy='960' r='350' fill='%23FFD700' opacity='0.05' filter='blur(150px)'/><path d='M0,1500 Q540,1700 1080,1500 L1080,1920 L0,1920 Z' fill='%230B0F19' opacity='0.9'/></svg>";

const DEFAULT_BG_16_9 = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080' viewBox='0 0 1920' height='1080'><defs><radialGradient id='g' cx='50%' cy='50%' r='70%'><stop offset='0%' stop-color='%231F2937'/><stop offset='60%' stop-color='%23111827'/><stop offset='100%' stop-color='%23030712'/></radialGradient></defs><rect width='100%' height='100%' fill='url(%23g)'/><circle cx='960' cy='540' r='300' fill='%23FFD700' opacity='0.05' filter='blur(150px)'/><path d='M0,850 Q960,980 1920,850 L1920,1080 L0,1080 Z' fill='%230B0F19' opacity='0.9'/></svg>";

export default function PosterMakerStudio({ onAddNotification }: PosterMakerStudioProps) {
  // Core user-editable content
  const [title, setTitle] = useState<string>("ခေါင်းပြတ်ကြီးနဲ့ စုန်းမ");
  const [tagline, setTagline] = useState<string>("အပိုင်း ၁");
  const [imageSrc, setImageSrc] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("9:16");

  // Automated layout metrics calculated by AI
  const [autoPositionY, setAutoPositionY] = useState<number>(42); // Default to safe TikTok Upper Half
  const [autoPositionX, setAutoPositionX] = useState<number>(50); // Horizontally centered
  const [autoTextColor, setAutoTextColor] = useState<string>("#FFD700"); // Yellow default
  const [autoFontSize, setAutoFontSize] = useState<number>(52); 
  const [autoRotation, setAutoRotation] = useState<number>(-2); // Dynamic slant
  const [autoOutlineWidth, setAutoOutlineWidth] = useState<number>(6); // High visibility border
  
  // Status states
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [geminiLog, setGeminiLog] = useState<string>("");
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);

  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key") || "";
    setHasApiKey(!!savedKey);
  }, []);

  // File uploading/dropping
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageSrc(event.target.result as string);
          setGeminiLog("");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageSrc(event.target.result as string);
          setGeminiLog("");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // FULLY AUTOMATED MULTIMODAL COMPOSITING ENGINE
  const handleGenerateThumbnail = async () => {
    if (!imageSrc) {
      onAddNotification("စခရင်ရှော့ပုံတင်ပါ", "Gemini ဖြင့် တွက်ချက်ရန် ပုံတင်ပေးပါဦး။", "warning");
      return;
    }

    const key = localStorage.getItem("gemini_api_key") || "";
    if (!key) {
      onAddNotification("API Key လိုအပ်သည်", "AI composite စနစ် အသုံးပြုနိုင်ရန် Settings တွင် Gemini API Key သိမ်းဆည်းပေးပါ။", "warning");
      return;
    }

    setIsGenerating(true);
    setGeminiLog("Analyzing frame composition and focal points...");

    try {
      const base64Data = imageSrc.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

      const systemPrompt = `You are an automated professional movie recap cover design algorithm.
Analyze the composition of this screenshot. The user wants to burn a title ("${title}") and optionally a tagline ("${tagline}") onto it for TikTok or YouTube.

Identify key items to avoid obscuring (faces, objects of action, main actors, eyes).
Calculate the best parameters:
- positionY: Vertical position of the center of the text block as a percentage (from 0 to 100, where 0 is top).
  * CRITICAL FOR TIKTOK (aspectRatio is "${aspectRatio}"): If aspectRatio is "9:16", standard TikTok profile feeds display as 1:1 squares (cutting off the top 22% and bottom 22%). Therefore, you MUST force positionY to be strictly between 35% and 50% so that it is always safe. If aspectRatio is "16:9", choose any safe zone between 25% and 75% that doesn't block faces.
- textColor: Best high-converting text color that matches or contrasts nicely with the scene. Must be either "#FFD700" (Bright Yellow) or "#FFFFFF" (Pure White).
- fontSize: Ideal font size scale multiplier (from 35 to 65) based on the length of the title text (longer title = smaller font).
- rotation: Dynamic slanting angle in degrees (strictly between -4 and 4, e.g., -3 or 2) to give the TikTok recap thumbnail organic energy.
- reasoning: A short 1-sentence recap of why you chose these settings.

You must return ONLY a JSON block with the exact schema below, with no markdown codeblocks, no backticks, and no extra text:
{"positionY": 40, "textColor": "#FFD700", "fontSize": 52, "rotation": -3, "reasoning": "Centered text at 40% height to fit inside TikTok's square crop without obscuring the main characters' faces."}`;

      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: systemPrompt },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data
                }
              }
            ]
          }]
        })
      });

      if (!response.ok) {
        throw new Error("Gemini API request failed.");
      }

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      
      // Clean possible markdown code wraps
      const cleanedJsonText = textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanedJsonText);

      if (parsed.positionY !== undefined) {
        // Enforce aspect ratio constraints programmatically
        let y = Number(parsed.positionY);
        if (aspectRatio === "9:16") {
          y = Math.max(35, Math.min(50, y)); // Hard limit to TikTok safe zone
        } else {
          y = Math.max(15, Math.min(85, y));
        }
        setAutoPositionY(y);
      }
      
      if (parsed.textColor) {
        setAutoTextColor(parsed.textColor === "#FFD700" || parsed.textColor === "#FFFFFF" ? parsed.textColor : "#FFD700");
      }
      
      if (parsed.fontSize) {
        setAutoFontSize(Math.max(25, Math.min(75, Number(parsed.fontSize))));
      }

      if (parsed.rotation !== undefined) {
        setAutoRotation(Math.max(-8, Math.min(8, Number(parsed.rotation))));
      }

      if (parsed.reasoning) {
        setGeminiLog(parsed.reasoning);
        onAddNotification("AI Composite Optimized", "Gemini balanced all elements and printed safe coordinates.", "success");
      }
    } catch (error: any) {
      console.error(error);
      onAddNotification("Automated Positioning Failed", "Using robust default safe layout settings.", "info");
      
      // Revert to high-fidelity defaults based on ratio
      if (aspectRatio === "9:16") {
        setAutoPositionY(42);
        setAutoTextColor("#FFD700");
        setAutoFontSize(50);
        setAutoRotation(-3);
      } else {
        setAutoPositionY(48);
        setAutoTextColor("#FFD700");
        setAutoFontSize(48);
        setAutoRotation(-1);
      }
      setGeminiLog("Aligned typography to standard safe-crop layout perfectly.");
    } finally {
      setIsGenerating(false);
    }
  };

  // HIGH RESOLUTION CANVAS PRINTER & EXPORT
  const handleDownloadCover = () => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc || (aspectRatio === "9:16" ? DEFAULT_BG_9_16 : DEFAULT_BG_16_9);
    
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const exportWidth = aspectRatio === "9:16" ? 1080 : 1920;
      const exportHeight = aspectRatio === "9:16" ? 1920 : 1080;
      
      canvas.width = exportWidth;
      canvas.height = exportHeight;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      
      // 1. Draw movie frame background
      ctx.drawImage(img, 0, 0, exportWidth, exportHeight);
      
      // 2. Cinematic overlay darkness
      const gradient = ctx.createLinearGradient(0, 0, 0, exportHeight);
      gradient.addColorStop(0, "rgba(0, 0, 0, 0.40)");
      gradient.addColorStop(0.5, "rgba(0, 0, 0, 0.15)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0.60)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, exportWidth, exportHeight);
      
      // 3. Baked extra-bold stroke typography
      ctx.save();
      
      const xPos = (autoPositionX / 100) * exportWidth;
      const yPos = (autoPositionY / 100) * exportHeight;
      
      ctx.translate(xPos, yPos);
      ctx.rotate((autoRotation * Math.PI) / 180);
      
      const scaleFactor = exportWidth / 420;
      const canvasFontSize = autoFontSize * scaleFactor;
      
      // Super thick Impact-style fonts
      ctx.font = `900 ${canvasFontSize}px sans-serif, Impact, "Arial Black"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      ctx.fillStyle = autoTextColor;
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = autoOutlineWidth * scaleFactor;
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      
      // Double outlines for professional contrast
      ctx.strokeText(title, 0, 0);
      
      // Smooth heavy drop shadows
      ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
      ctx.shadowBlur = 14 * scaleFactor;
      ctx.shadowOffsetX = 7 * scaleFactor;
      ctx.shadowOffsetY = 7 * scaleFactor;
      
      ctx.fillText(title, 0, 0);
      
      // Clean shadows for tagline
      ctx.shadowColor = "transparent";
      
      if (tagline) {
        const subFontSize = canvasFontSize * 0.45;
        ctx.font = `bold ${subFontSize}px sans-serif, "Arial Black"`;
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = (autoOutlineWidth * 0.55) * scaleFactor;
        
        const yOffset = canvasFontSize * 0.72;
        ctx.strokeText(tagline, 0, yOffset);
        ctx.fillText(tagline, 0, yOffset);
      }
      
      ctx.restore();
      
      try {
        const exportUrl = canvas.toDataURL("image/jpeg", 0.95);
        const link = document.createElement("a");
        link.href = exportUrl;
        link.download = `tiktok_automated_cover_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        onAddNotification("ကဗာပုံဒေါင်းလုဒ်ပြီးပါပြီ", "TikTok-ready cover exported with baked-in safe typography.", "success");
      } catch (err) {
        console.error(err);
        onAddNotification("မအောင်မြင်ပါ", "Could not export canvas image. Try using a standard system background.", "warning");
      }
    };
  };

  const currentBgUrl = imageSrc || (aspectRatio === "9:16" ? DEFAULT_BG_9_16 : DEFAULT_BG_16_9);

  return (
    <div className="flex flex-col h-full overflow-hidden text-slate-100 font-sans bg-[#070B13]" id="poster-maker-studio">
      {/* Header */}
      <div className="p-4 border-b border-[#1E293B] bg-[#0D1321] shrink-0 select-none">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-500/20">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div className="text-left flex-1">
            <h2 className="text-sm font-bold tracking-wide text-slate-100">AI Composite Studio</h2>
            <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Automated Thumbnail Optimizer</p>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        {!hasApiKey && (
          <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-2xl flex items-start gap-2.5 text-left select-none">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
            <div>
              <p className="text-[11px] font-bold text-amber-400">Settings API Key Required</p>
              <p className="text-[9.5px] text-slate-400 leading-normal mt-0.5">
                AI Composite Engine ကို အသုံးပြုရန်အတွက် Settings တွင် Gemini API Key ကို အရင်ဆုံးသိမ်းဆည်းပေးပါ။ key ရှိမှသာ မျက်နှာများနှင့် frames များကို AI မှ အလိုအလျောက် တွက်ချက်ပေးမည်ဖြစ်သည်။
              </p>
            </div>
          </div>
        )}

        {/* Dynamic Canvas Live Preview */}
        <div className="space-y-2 select-none">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-left">
            TikTok Grid-Safe Preview (1:1 Square Crop Guide)
          </span>

          <div className="flex justify-center bg-slate-950 border border-slate-900 rounded-2xl p-4 overflow-hidden relative">
            <div 
              className={`relative shadow-2xl rounded-xl border border-slate-800/80 overflow-hidden bg-black transition-all duration-300 ${
                aspectRatio === "16:9" 
                  ? "w-full max-w-md aspect-[16/9]" 
                  : "w-56 aspect-[9/16]"
              }`}
            >
              {/* Background Movie Screenshot */}
              <img 
                src={currentBgUrl} 
                alt="Automated background" 
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
              />

              {/* Black Cinematic Vignettes */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-black/35 pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

              {/* TikTok Safe Grid Highlight Area */}
              {aspectRatio === "9:16" && (
                <div className="absolute inset-x-0 top-[21.875%] bottom-[21.875%] border border-dashed border-emerald-400/35 pointer-events-none flex items-center justify-center">
                  <span className="text-[7.5px] font-black text-emerald-400 bg-black/65 px-1.5 py-0.5 rounded tracking-widest uppercase opacity-75">
                    TikTok Profile square feed crop
                  </span>
                </div>
              )}

              {/* Live Overlay Renderer */}
              <div className="absolute inset-0 select-none pointer-events-none flex items-center justify-center">
                <div 
                  style={{
                    position: "absolute",
                    top: `${autoPositionY}%`,
                    left: `${autoPositionX}%`,
                    transform: `translate(-50%, -50%) rotate(${autoRotation}deg)`,
                    width: "90%",
                  }}
                  className="text-center font-sans"
                >
                  {/* Thick solid Yellow or White overlay */}
                  <h1 
                    style={{
                      color: autoTextColor,
                      fontSize: `${autoFontSize * 0.45}px`,
                      WebkitTextStroke: `${autoOutlineWidth * 0.45}px #000000`,
                      textShadow: "4px 4px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000, 0px 4px 0px #000, 0px -4px 0px #000, 4px 0px 0px #000, -4px 0px 0px #000",
                    }}
                    className="font-black leading-tight tracking-tight uppercase break-words select-none inline-block filter drop-shadow-2xl"
                  >
                    {title || "ရုပ်ရှင်ခေါင်းစဉ်"}
                  </h1>

                  {/* Tagline */}
                  {tagline && (
                    <div className="mt-1">
                      <span 
                        style={{
                          fontSize: `${autoFontSize * 0.22}px`,
                          WebkitTextStroke: `${autoOutlineWidth * 0.25}px #000000`,
                          textShadow: "2px 2px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000",
                        }}
                        className="font-bold text-white tracking-wide uppercase italic inline-block"
                      >
                        {tagline}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Inputs Layout (NO MANUAL SLIDERS OR COLOR BUTTONS) */}
        <div className="bg-[#101622]/90 border border-slate-800 rounded-2xl p-4 space-y-4 text-left">
          <div className="flex items-center justify-between select-none">
            <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Type className="w-4 h-4 text-emerald-400" />
              Movie Recap Details
            </h3>
            {imageSrc && (
              <button 
                onClick={() => {
                  setImageSrc("");
                  setGeminiLog("");
                }} 
                className="text-[9px] bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-emerald-400 font-bold px-2 py-0.5 rounded transition-colors cursor-pointer"
              >
                Clear Frame
              </button>
            )}
          </div>

          {/* Image Dropzone */}
          {!imageSrc ? (
            <div 
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border border-dashed border-slate-800 hover:border-emerald-500/25 transition-colors bg-[#0D1321]/40 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer text-center select-none"
            >
              <input 
                type="file" 
                id="screenshot-upload" 
                accept="image/*" 
                onChange={handleFileChange} 
                className="hidden" 
              />
              <label htmlFor="screenshot-upload" className="cursor-pointer flex flex-col items-center gap-2">
                <Upload className="w-6 h-6 text-emerald-400 animate-pulse" />
                <div>
                  <p className="text-[10px] font-bold text-slate-200">မင်းသား/မင်းသမီး မျက်နှာပါသော စခရင်ရှော့ပုံတင်ရန်</p>
                  <p className="text-[8.5px] text-slate-500 mt-0.5">Drag & drop or tap to select a movie screenshot</p>
                </div>
              </label>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-slate-950 p-2.5 rounded-xl border border-slate-850 select-none">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-900 shrink-0 border border-slate-800">
                <img src={imageSrc} className="w-full h-full object-cover" alt="Active cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-slate-200 truncate">Screenshot Ready for Compositing</p>
                <p className="text-[8.5px] text-emerald-400 font-semibold uppercase tracking-wider mt-0.5">Custom Background Active</p>
              </div>
            </div>
          )}

          {/* Film Title Input */}
          <div className="grid grid-cols-2 gap-3 select-none">
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">ဗီဒီယိုခေါင်းစဉ် (Recap Title)</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ခေါင်းပြတ်ကြီးနဲ့ စုန်းမ"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-700 focus:outline-none focus:border-emerald-500/40 select-text"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">အပိုင်း/ခေါင်းစဉ်ခွဲ (Tagline)</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="အပိုင်း ၁"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-700 focus:outline-none focus:border-emerald-500/40 select-text"
              />
            </div>
          </div>

          {/* Aspect Ratio Ratio Toggles */}
          <div className="space-y-1.5 border-t border-slate-850 pt-3 select-none">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Platform layout ratio</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAspectRatio("9:16")}
                className={`py-2 px-3 rounded-xl font-bold border flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer ${
                  aspectRatio === "9:16"
                    ? "bg-emerald-500/10 border-emerald-500/45 text-emerald-400"
                    : "bg-[#0D1321] border-slate-850 text-slate-300 hover:border-slate-800"
                }`}
              >
                <span>TikTok / Shorts (9:16)</span>
              </button>

              <button
                type="button"
                onClick={() => setAspectRatio("16:9")}
                className={`py-2 px-3 rounded-xl font-bold border flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer ${
                  aspectRatio === "16:9"
                    ? "bg-emerald-500/10 border-emerald-500/45 text-emerald-400"
                    : "bg-[#0D1321] border-slate-850 text-slate-300 hover:border-slate-800"
                }`}
              >
                <span>YouTube (16:9)</span>
              </button>
            </div>
          </div>

          {/* AI Trigger and Download Deck */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-850 select-none">
            <button
              onClick={handleGenerateThumbnail}
              disabled={isGenerating || !imageSrc}
              className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition duration-150 cursor-pointer ${
                !imageSrc 
                  ? "bg-slate-950 border border-slate-900 text-slate-600 cursor-not-allowed"
                  : isGenerating 
                    ? "bg-slate-900 border border-slate-800 text-slate-500" 
                    : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/10"
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>AI တွက်ချက်နေသည်...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-300" />
                  <span>AI Generate Thumbnail</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadCover}
              className="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-200 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4.5 h-4.5 text-slate-400" />
              <span>Download Cover</span>
            </button>
          </div>
        </div>

        {/* Gemini Layout Advice log */}
        {geminiLog && (
          <div className="bg-[#101622]/90 border border-slate-800 rounded-2xl p-4 space-y-2 text-left">
            <div className="flex items-center gap-2 select-none">
              <Eye className="w-4 h-4 text-emerald-400" />
              <label className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">
                Gemini Automated Layout Logic
              </label>
            </div>
            <p className="text-[10.5px] text-slate-300 font-mono leading-relaxed select-text p-2.5 bg-slate-950 rounded-xl border border-slate-850 break-words whitespace-pre-wrap">
              {geminiLog}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
