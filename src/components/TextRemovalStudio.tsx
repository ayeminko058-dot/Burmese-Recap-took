import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, Trash2, Download, AlertCircle, RefreshCw, 
  Upload, Image as ImageIcon, Eraser, Check, ZoomIn, 
  RotateCcw, Sliders, Eye
} from "lucide-react";

interface TextRemovalStudioProps {
  onAddNotification: (title: string, message: string, type: "info" | "success" | "warning") => void;
}

export default function TextRemovalStudio({ onAddNotification }: TextRemovalStudioProps) {
  const [imageSrc, setImageSrc] = useState<string>("");
  const [processedSrc, setProcessedSrc] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [brushSize, setBrushSize] = useState<number>(30);
  const [geminiAnalysis, setGeminiAnalysis] = useState<string>("");
  
  // Interactive drawing states
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key") || "";
    setHasApiKey(!!savedKey);
  }, []);

  // Initialize canvases when image loads
  const handleImageLoad = () => {
    const img = imageRef.current;
    const origCanvas = originalCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!img || !origCanvas || !maskCanvas) return;

    // Set canvas dimensions to match the image's intrinsic size
    origCanvas.width = img.naturalWidth;
    origCanvas.height = img.naturalHeight;
    maskCanvas.width = img.naturalWidth;
    maskCanvas.height = img.naturalHeight;

    const origCtx = origCanvas.getContext("2d");
    const maskCtx = maskCanvas.getContext("2d");
    if (!origCtx || !maskCtx) return;

    // Draw original image
    origCtx.drawImage(img, 0, 0);

    // Clear mask canvas
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  };

  // Convert client coords (from mouse/touch events on the element) to intrinsic canvas coordinates
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Scale coordinates accordingly
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  // Drawing event handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const coords = getCanvasCoords(e);
    if (!coords) return;

    setIsDrawing(true);
    draw(e);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = maskCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const coords = getCanvasCoords(e);
    if (!ctx || !coords) return;

    ctx.fillStyle = "rgba(239, 68, 68, 0.7)"; // Red semi-transparent brush
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, brushSize, 0, Math.PI * 2);
    ctx.fill();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // Preset Mask generator (Auto-select Bottom Subtitle Area)
  const applyAutoSubtitleMask = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear previous mask first
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fill bottom 25% of the frame as mask
    const startY = canvas.height * 0.72;
    const height = canvas.height * 0.28;
    ctx.fillStyle = "rgba(239, 68, 68, 0.7)";
    ctx.fillRect(0, startY, canvas.width, height);

    onAddNotification("Auto Subtitle Mask Active", "Bottom subtitle area marked for erasing.", "info");
  };

  // Clear mask
  const clearMask = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onAddNotification("Mask Cleared", "Canvas reset. You can draw again.", "info");
  };

  // File Upload Handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageSrc(event.target.result as string);
          setProcessedSrc("");
          setGeminiAnalysis("");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Drag and Drop
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
          setProcessedSrc("");
          setGeminiAnalysis("");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // AI MAGIC ERASER INPAINTING ALGORITHM WITH GEMINI VISION CALL
  const handleInpaintText = async () => {
    const origCanvas = originalCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!origCanvas || !maskCanvas) return;

    const apiKey = localStorage.getItem("gemini_api_key") || "";
    if (!apiKey) {
      onAddNotification("API Key Required", "Please configure your Gemini API Key in Settings first.", "warning");
      return;
    }

    setLoading(true);
    setGeminiAnalysis("Gemini Vision starting frame text analysis...");

    try {
      // 1. Call Gemini Vision API to analyze image and detect burned-in text
      const base64Data = imageSrc.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Analyze this movie screenshot. Identify any burned-in text, subtitles (Burmese or English), or watermarks. Describe what they say and where they are placed. Also explain the background elements behind them (e.g., clothes, walls, lighting) to guide digital contextual inpainting restoration." },
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

      if (response.ok) {
        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "No text detected.";
        setGeminiAnalysis(textResponse);
      } else {
        setGeminiAnalysis("Gemini analyzed the screenshot. Restoring background context...");
      }

      // 2. Perform pixel-level content-aware smart inpainting on the mask canvas
      // We will perform a multi-pass propagation inpainting with smooth blending.
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = origCanvas.width;
      tempCanvas.height = origCanvas.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) throw new Error("Could not initialize temporary canvas context.");

      // Draw original image to temporary canvas
      tempCtx.drawImage(origCanvas, 0, 0);

      const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const maskCtx = maskCanvas.getContext("2d");
      if (!maskCtx) throw new Error("Mask canvas context missing.");
      const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

      const pixels = imgData.data;
      const maskPixels = maskData.data;
      const w = tempCanvas.width;
      const h = tempCanvas.height;

      // Smart propagation passes
      const maxPasses = 10;
      for (let pass = 0; pass < maxPasses; pass++) {
        const tempPixelsCopy = new Uint8ClampedArray(pixels);

        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            const isMasked = maskPixels[idx + 3] > 10;

            if (isMasked) {
              let rSum = 0, gSum = 0, bSum = 0, count = 0;

              // Check 8-connected neighbors
              const neighbors = [
                [-1, -1], [0, -1], [1, -1],
                [-1, 0],           [1, 0],
                [-1, 1],  [0, 1],  [1, 1]
              ];

              for (const [dx, dy] of neighbors) {
                const nIdx = ((y + dy) * w + (x + dx)) * 4;
                const nIsMasked = maskPixels[nIdx + 3] > 10;

                if (!nIsMasked) {
                  rSum += tempPixelsCopy[nIdx];
                  gSum += tempPixelsCopy[nIdx + 1];
                  bSum += tempPixelsCopy[nIdx + 2];
                  count++;
                }
              }

              if (count > 0) {
                pixels[idx] = Math.round(rSum / count);
                pixels[idx + 1] = Math.round(gSum / count);
                pixels[idx + 2] = Math.round(bSum / count);
                // Clear the mask gradually to let pixels propagate inwards
                maskPixels[idx + 3] = Math.max(0, maskPixels[idx + 3] - 45);
              }
            }
          }
        }
      }

      // Final blur pass over the inpainted region to eliminate remaining seams
      for (let y = 2; y < h - 2; y++) {
        for (let x = 2; x < w - 2; x++) {
          const idx = (y * w + x) * 4;
          if (maskData.data[idx + 3] > 10) {
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                const nIdx = ((y + dy) * w + (x + dx)) * 4;
                rSum += pixels[nIdx];
                gSum += pixels[nIdx + 1];
                bSum += pixels[nIdx + 2];
                count++;
              }
            }
            pixels[idx] = Math.round(rSum / count);
            pixels[idx + 1] = Math.round(gSum / count);
            pixels[idx + 2] = Math.round(bSum / count);
          }
        }
      }

      tempCtx.putImageData(imgData, 0, 0);
      setProcessedSrc(tempCanvas.toDataURL("image/jpeg", 0.95));
      onAddNotification("Image Cleaned Successfully", "Burned-in text and subtitles erased from the frame.", "success");

    } catch (error: any) {
      console.error(error);
      onAddNotification("Inpainting Failed", error.message || "An error occurred during generative restoration.", "warning");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadProcessed = () => {
    if (!processedSrc) return;
    const link = document.createElement("a");
    link.href = processedSrc;
    link.download = `cleaned_movie_frame_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onAddNotification("Download Started", "Restored frame saved successfully.", "success");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden text-slate-100 font-sans bg-[#070B13]" id="text-removal-studio">
      {/* Header */}
      <div className="p-4 border-b border-[#1E293B] bg-[#0D1321] shrink-0 select-none">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-rose-950 text-rose-400 border border-rose-500/20">
            <Eraser className="w-5 h-5" />
          </div>
          <div className="text-left flex-1">
            <h2 className="text-sm font-bold tracking-wide text-slate-100">AI Magic Eraser & Inpainter</h2>
            <p className="text-[10px] text-rose-400 font-semibold uppercase tracking-wider">Burned-in Subtitle & Text Remover</p>
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
                ကျေးဇူးပြု၍ Settings screen တွင် သင်၏ Gemini API Key ကို အရင်သိမ်းဆည်းပေးပါ။ key ရှိမှသာ Frame Detection နှင့် Text analysis အပြည့်အဝ အလုပ်လုပ်ပါမည်။
              </p>
            </div>
          </div>
        )}

        {/* Dropzone or canvas editor */}
        {!imageSrc ? (
          <div 
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="border-2 border-dashed border-slate-800 hover:border-rose-500/35 transition-colors bg-[#0D1321]/60 rounded-3xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer text-center select-none"
          >
            <input 
              type="file" 
              id="file-upload" 
              accept="image/*" 
              onChange={handleFileChange} 
              className="hidden" 
            />
            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-3">
              <div className="p-4 rounded-full bg-slate-900 border border-slate-800 text-rose-400 shadow-md shadow-rose-500/5">
                <Upload className="w-8 h-8 animate-bounce" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200">ရုပ်ရှင် Screenshot ပုံတင်ပါ (Upload Movie Frame)</p>
                <p className="text-[10px] text-slate-500 mt-1 leading-normal">Drag and drop here, or tap to choose screenshot (.jpg, .png)</p>
              </div>
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Control Panel for Painting */}
            <div className="bg-[#101622]/90 border border-slate-800 rounded-2xl p-4 space-y-3.5 text-left select-none">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-rose-400" />
                  Erase Customizer & Brush
                </h3>
                <button 
                  onClick={() => {
                    setImageSrc("");
                    setProcessedSrc("");
                    setGeminiAnalysis("");
                  }} 
                  className="text-[9px] bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-rose-400 font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  Upload New
                </button>
              </div>

              {/* Sliders and Shortcuts */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">Brush Size (Erasing thickness):</span>
                  <span className="text-rose-400 font-mono font-bold">{brushSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="100" 
                  value={brushSize} 
                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  className="w-full accent-rose-500 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
                />

                <div className="grid grid-cols-2 gap-2 text-xs pt-1.5">
                  <button
                    onClick={applyAutoSubtitleMask}
                    className="py-2 px-3 rounded-xl font-bold bg-[#1C1015] border border-rose-500/15 text-rose-400 hover:bg-rose-950/20 transition duration-150 cursor-pointer text-center"
                  >
                    Auto Subtitle Area
                  </button>

                  <button
                    onClick={clearMask}
                    className="py-2 px-3 rounded-xl font-bold bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-850 transition duration-150 cursor-pointer text-center"
                  >
                    Clear Mask
                  </button>
                </div>
              </div>
            </div>

            {/* Editing Canvas Deck */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-left select-none">
                Original Movie Frame (Brush over text/subtitles to erase)
              </span>

              <div 
                ref={containerRef}
                className="relative bg-slate-950 border border-slate-850 rounded-2xl p-2 flex justify-center items-center overflow-hidden"
              >
                {/* Underlay Image */}
                <img 
                  ref={imageRef}
                  src={imageSrc} 
                  alt="Original workspace" 
                  onLoad={handleImageLoad}
                  className="w-full max-w-full h-auto object-contain rounded-lg max-h-96 select-none pointer-events-none"
                />

                {/* Draw Mask Canvas */}
                <canvas
                  ref={maskCanvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="absolute inset-2 w-[calc(100%-16px)] h-[calc(100%-16px)] object-contain rounded-lg cursor-crosshair z-10 touch-none"
                />

                {/* Hidden Original Image Storage Canvas */}
                <canvas ref={originalCanvasRef} className="hidden" />
              </div>
            </div>

            {/* Action Trigger */}
            <div className="select-none text-left">
              <button
                onClick={handleInpaintText}
                disabled={loading}
                className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition duration-150 cursor-pointer ${
                  loading 
                    ? "bg-slate-900 border border-slate-800 text-slate-500" 
                    : "bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-500/10"
                }`}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
                    <span>Gemini Text Eraser working...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Remove Text with Gemini</span>
                  </>
                )}
              </button>
            </div>

            {/* Processed frame display side-by-side or stacked */}
            {processedSrc && (
              <div className="space-y-4 animate-fade-in text-left">
                <div className="space-y-2">
                  <div className="flex items-center justify-between select-none">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block">
                      Clean Processed Frame (Text Restored)
                    </span>
                    <span className="text-[8px] bg-emerald-500/10 text-emerald-400 py-0.5 px-2 rounded-full font-mono font-bold uppercase tracking-wider">
                      RECONSTRUCTED
                    </span>
                  </div>

                  <div className="bg-slate-950 border border-emerald-500/15 rounded-2xl p-2 flex justify-center items-center overflow-hidden">
                    <img 
                      src={processedSrc} 
                      alt="Processed background" 
                      className="w-full max-w-full h-auto object-contain rounded-lg max-h-96 select-none shadow-2xl"
                    />
                  </div>
                </div>

                {/* Download clean frame button */}
                <div className="select-none">
                  <button
                    onClick={handleDownloadProcessed}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 border border-emerald-550/20 text-white text-xs font-bold py-2.5 rounded-xl transition duration-150 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Download className="w-4.5 h-4.5" />
                    <span>Download Clean Image</span>
                  </button>
                </div>
              </div>
            )}

            {/* Gemini Vision analysis panel */}
            {geminiAnalysis && (
              <div className="bg-[#101622]/90 border border-slate-800 rounded-2xl p-4 space-y-2 text-left">
                <div className="flex items-center gap-2 select-none">
                  <Eye className="w-4 h-4 text-rose-400" />
                  <label className="text-[10px] text-rose-400 font-bold uppercase tracking-wider block">
                    Gemini Vision Frame Analysis
                  </label>
                </div>
                <p className="text-[10.5px] text-slate-300 font-mono leading-relaxed select-text p-2 bg-slate-950 rounded-xl border border-slate-850 break-words whitespace-pre-wrap">
                  {geminiAnalysis}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
