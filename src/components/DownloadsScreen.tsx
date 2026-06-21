import React from "react";
import { FolderOpen, FileText, Music, Play, Download, Trash2, Video } from "lucide-react";

interface SavedFile {
  id: string;
  name: string;
  type: "srt" | "audio" | "video";
  timestamp: string;
  size: string;
  data: string;
  audioUrl?: string;
  url?: string;
  videoUrl?: string;
}

interface DownloadsScreenProps {
  files: SavedFile[];
  onDeleteFile: (id: string) => void;
  onAddNotification: (title: string, message: string, type: "info" | "success" | "warning") => void;
}

export default function DownloadsScreen({ files, onDeleteFile, onAddNotification }: DownloadsScreenProps) {
  
  const handleDownloadAgain = (file: SavedFile) => {
    if (file.type === "video" || file.url || file.videoUrl) {
      const videoHref = file.url || file.videoUrl || file.audioUrl || file.data;
      if (videoHref && videoHref.startsWith("http")) {
        const link = document.createElement("a");
        link.href = videoHref;
        link.download = file.name;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.click();
        onAddNotification("Download Started", `${file.name} download initiated.`, "success");
        return;
      }
    }

    if (file.type === "audio" && file.audioUrl) {
      const link = document.createElement("a");
      link.href = file.audioUrl;
      link.download = file.name;
      link.click();
      return;
    }

    const blob = new Blob([file.data], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
    onAddNotification("File Exported", `${file.name} saved successfully.`, "success");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden text-slate-100 font-sans" id="downloads-library">
      <div className="p-4 border-b border-[#1E293B] bg-[#0D1321] shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-slate-100">Downloads & History</h2>
            <p className="text-[10px] text-slate-400">Archived CapCut Materials</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#070B13]">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center text-slate-500">
            <FolderOpen className="w-12 h-12 text-slate-600 mb-3 stroke-[1.5]" />
            <h3 className="text-xs font-semibold text-slate-300">File Vault Empty</h3>
            <p className="text-[10px] text-slate-500 max-w-[200px] mt-1 text-center">
              Compiled narration.srt files and Text to Voice MP3 waveforms will appear in this directory.
            </p>
          </div>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className="bg-[#1A2333]/90 border border-[#1E293B] hover:border-slate-700 rounded-2xl p-3.5 flex items-center justify-between gap-3 transition-colors duration-200"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2.5 rounded-xl shrink-0 ${
                  file.type === "srt" 
                    ? "bg-emerald-500/15 text-emerald-400" 
                    : file.type === "video"
                    ? "bg-blue-500/15 text-blue-400"
                    : "bg-orange-500/15 text-orange-400"
                }`}>
                  {file.type === "srt" ? (
                    <FileText className="w-4 h-4" />
                  ) : file.type === "video" ? (
                    <Video className="w-4 h-4" />
                  ) : (
                    <Music className="w-4 h-4" />
                  )}
                </div>

                <div className="min-w-0">
                  <h4 className="text-[11px] font-semibold text-slate-200 truncate">{file.name}</h4>
                  <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-500 font-mono">
                    <span>{file.size}</span>
                    <span>•</span>
                    <span>{file.timestamp}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => handleDownloadAgain(file)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Save File"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDeleteFile(file.id)}
                  className="p-1.5 rounded-lg bg-slate-800/40 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                  title="Delete File"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
