/**
 * Helper to extract and downsample the audio track of a video or audio file
 * into a lightweight 16kHz mono WAV file in the browser.
 */

export async function extractAudioTrack(file: File): Promise<Blob> {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("Web Audio API is not supported in this browser environment.");
  }

  const audioCtx = new AudioContextClass();
  const fileArrayBuffer = await file.arrayBuffer();
  
  // Decode audio data asynchronously
  const audioBuffer = await audioCtx.decodeAudioData(fileArrayBuffer);
  
  // Downsample to 16000Hz, Mono channel to keep the payload size extremely tiny
  const targetSampleRate = 16000;
  const totalFrames = Math.round(audioBuffer.duration * targetSampleRate);
  
  const OfflineAudioContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (!OfflineAudioContextClass) {
    throw new Error("OfflineAudioContext is not supported in this browser environment.");
  }
  
  const offlineCtx = new OfflineAudioContextClass(1, totalFrames, targetSampleRate);
  
  // Set up the source
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  
  // Render downsampled mono buffer
  const renderedBuffer = await offlineCtx.startRendering();
  
  // Encode as standard WAV
  return bufferToWav(renderedBuffer);
}

/**
 * Standard PCM 16-bit WAV encoder
 */
function bufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels: Float32Array[] = [];
  let offset = 0;
  let pos = 0;

  // Set uint helper functions
  const setUint16 = (data: number) => {
    view.setUint16(pos, data, true);
    pos += 2;
  };

  const setUint32 = (data: number) => {
    view.setUint32(pos, data, true);
    pos += 4;
  };

  // write RIFF WAVE header
  setUint32(0x46464952);                         // "RIFF"
  setUint32(length - 8);                         // file length - 8
  setUint32(0x45564157);                         // "WAVE"

  setUint32(0x20746d66);                         // "fmt " chunk
  setUint32(16);                                 // chunk length
  setUint16(1);                                  // sample format (1 = raw PCM)
  setUint16(numOfChan);                          // channel count
  setUint32(buffer.sampleRate);                  // sample rate
  setUint32(buffer.sampleRate * 2 * numOfChan);  // byte rate
  setUint16(numOfChan * 2);                      // block align
  setUint16(16);                                 // bits per sample

  setUint32(0x61746164);                         // "data" chunk
  setUint32(length - pos - 4);                   // chunk length

  // Gather channels
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  // Write interleaved PCM 16-bit samples
  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp sample
      // Scale to 16-bit signed integer
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArr], { type: "audio/wav" });
}
