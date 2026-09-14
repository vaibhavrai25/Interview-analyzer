const DEFAULT_BACKEND_URL =
  process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

function backendToWsUrl(baseUrl) {
  if (baseUrl.startsWith("https://")) return baseUrl.replace("https://", "wss://");
  if (baseUrl.startsWith("http://")) return baseUrl.replace("http://", "ws://");
  return baseUrl;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }

  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function parseRateFromMimeType(mimeType, fallback = 24000) {
  const match = String(mimeType || "").match(/rate=(\d+)/);
  if (!match) return fallback;
  return Number(match[1]) || fallback;
}

function getSupportedAudioMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const t of types) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "";
}

export class GeminiLiveVoiceClient {
  constructor({
    interviewId,
    userEmail,
    config,
    externalStream,
    onStatus,
    onTranscript,
    onAssistantText,
    onUserText,
    onAudio,
    onTurnComplete,
    onError,
    onEvent,
  }) {
    this.interviewId = interviewId;
    this.userEmail = userEmail;
    this.config = config || {};
    this.externalStream = externalStream || null;

    this.onStatus = onStatus || (() => { });
    this.onTranscript = onTranscript || (() => { });
    this.onAssistantText = onAssistantText || (() => { });
    this.onUserText = onUserText || (() => { });
    this.onAudio = onAudio || (() => { });
    this.onTurnComplete = onTurnComplete || (() => { });
    this.onError = onError || (() => { });
    this.onEvent = onEvent || (() => { });

    this.ws = null;
    this.stream = null;
    this.ownsStream = false;

    // Turn recording for Groq Whisper transcription
    this.userAudioChunks = [];
    this.userMediaRecorder = null;
    this.isTurnRecording = false;

    // Mic processing nodes
    this.audioContext = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.inputSilenceGain = null;

    // AI Playback nodes
    this.playbackContext = null;
    this.playbackDestination = null;

    // Scheduler states
    this.nextPlaybackTime = 0;
    this.playbackLeadTime = 0.15;
    this.lastAudioChunkAt = 0;
    this.audioChunkCounter = 0;
    this.activeAudioSources = new Set();
    this.audioResponseGeneration = 0;
    this.isAssistantCurrentlySpeaking = false;
    this.speechEndTimer = null;
    this.schedulerResetTimer = null;

    // Connection states
    this.isConnected = false;
    this.isMuted = false;
    this.hasStartedMic = false;
    this.closedByUser = false;

    this.connectPromiseResolve = null;
    this.connectPromiseReject = null;
    this.connectionTimeout = null;
    this.heartbeatTimer = null;
  }

  getWsUrl() {
    const wsBase = backendToWsUrl(DEFAULT_BACKEND_URL);
    return `${wsBase}/gemini/live/ws/${encodeURIComponent(this.interviewId)}`;
  }

  ensurePlaybackContext(sampleRate = 24000) {
    if (!this.playbackContext || this.playbackContext.state === "closed") {
      this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
      this.playbackDestination = this.playbackContext.createMediaStreamDestination();
      this.nextPlaybackTime = 0;
      this.activeAudioSources = new Set();
    }
    return this.playbackContext;
  }

  getAssistantAudioStream() {
    this.ensurePlaybackContext(24000);
    return this.playbackDestination.stream;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "heartbeat", at: Date.now() }));
        }
      } catch (_) { }
    }, 8000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  markAssistantSpeaking() {
    this.isAssistantCurrentlySpeaking = true;
    clearTimeout(this.speechEndTimer);

    this.speechEndTimer = setTimeout(() => {
      if (this.activeAudioSources.size === 0) {
        this.isAssistantCurrentlySpeaking = false;
      }
    }, 1200);
  }

  resetPlaybackSchedulerSoon() {
    clearTimeout(this.schedulerResetTimer);

    this.schedulerResetTimer = setTimeout(() => {
      if (this.activeAudioSources.size === 0) {
        this.nextPlaybackTime = 0;
        this.isAssistantCurrentlySpeaking = false;
      }
    }, 700);
  }

  stopAllScheduledAssistantAudio() {
    this.audioResponseGeneration += 1;

    for (const source of this.activeAudioSources) {
      try {
        source.onended = null;
        source.stop(0);
      } catch (_) { }
    }

    this.activeAudioSources.clear();
    this.nextPlaybackTime = 0;
    this.audioChunkCounter = 0;
    this.isAssistantCurrentlySpeaking = false;

    clearTimeout(this.speechEndTimer);
    clearTimeout(this.schedulerResetTimer);

    // FIX: If we forcibly abort the AI's audio, we must reactivate the user's mic immediately.
    this.startUserTurnRecording();
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    this.closedByUser = false;
    this.audioResponseGeneration = 0;
    this.audioChunkCounter = 0;
    this.nextPlaybackTime = 0;
    this.onStatus("Opening Gemini backend WebSocket...");

    return new Promise((resolve, reject) => {
      this.connectPromiseResolve = resolve;
      this.connectPromiseReject = reject;

      this.connectionTimeout = setTimeout(() => {
        if (!this.hasStartedMic) {
          const error = new Error("Gemini backend WebSocket timeout.");
          console.error("Connection Timeout:", error.message);
          this.onError(error);
          this.safeReject(error);
          this.disconnect();
        }
      }, 35000);

      this.ws = new WebSocket(this.getWsUrl());

      this.ws.onopen = () => {
        this.isConnected = true;
        this.startHeartbeat();
        this.onStatus("Backend WebSocket connected. Sending Gemini setup...");

        console.log("Client WS connected, sending start message");
        this.ws.send(
          JSON.stringify({
            type: "start",
            user_email: this.userEmail,
            config: {
              ...this.config,
              user_email: this.userEmail,
            },
          })
        );
      };

      this.ws.onmessage = async (event) => {
        await this.handleBackendMessage(event);

        if (this.isConnected && this.hasStartedMic) {
          clearTimeout(this.connectionTimeout);
          this.safeResolve();
        }
      };

      this.ws.onerror = (error) => {
        console.error("Gemini backend WS error:", error);
        if (!this.closedByUser) {
          this.onError(error);
          this.safeReject(new Error("Gemini backend WebSocket error."));
        }
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        this.stopHeartbeat();

        if (!this.closedByUser && !this.hasStartedMic) {
          const error = new Error(
            event.reason || `Gemini backend WebSocket closed before setup. Code: ${event.code}`
          );
          this.onError(error);
          this.safeReject(error);
        }

        this.onStatus("Gemini Live disconnected.");
      };
    });
  }

  safeResolve() {
    if (this.connectPromiseResolve) {
      this.connectPromiseResolve();
      this.connectPromiseResolve = null;
      this.connectPromiseReject = null;
    }
  }

  safeReject(error) {
    if (this.connectPromiseReject) {
      this.connectPromiseReject(error);
      this.connectPromiseResolve = null;
      this.connectPromiseReject = null;
    }
  }

  // Starts recording user audio for backend Whisper transcription
  startUserTurnRecording() {
    if (this.isAssistantCurrentlySpeaking || this.isMuted || !this.stream) return;
    if (this.userMediaRecorder && this.userMediaRecorder.state === "recording") return;

    try {
      const audioTracks = this.stream.getAudioTracks();
      if (!audioTracks.length) return;

      const audioStream = new MediaStream(audioTracks);
      const mimeType = getSupportedAudioMimeType();

      this.userAudioChunks = [];
      this.userMediaRecorder = mimeType
        ? new MediaRecorder(audioStream, { mimeType })
        : new MediaRecorder(audioStream);

      this.userMediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.userAudioChunks.push(e.data);
        }
      };

      this.userMediaRecorder.start(250);
      this.isTurnRecording = true;
    } catch (err) {
      console.warn("User turn recorder start error:", err);
    }
  }

  // Stops recording and sends the audio slice to Groq Whisper via WebSocket
  finishUserTurnRecording() {
    if (!this.userMediaRecorder || this.userMediaRecorder.state !== "recording") return;

    const recorder = this.userMediaRecorder;
    this.isTurnRecording = false;

    recorder.onstop = async () => {
      try {
        if (this.userAudioChunks.length === 0) return;
        const blob = new Blob(this.userAudioChunks, {
          type: recorder.mimeType || "audio/webm",
        });
        this.userAudioChunks = [];

        // Ignore tiny accidental noise clicks (< 1200 bytes)
        if (blob.size < 1200) return;

        const buffer = await blob.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: "transcribe_audio",
              audio_b64: base64,
            })
          );
        }
      } catch (err) {
        console.warn("Failed to send audio to Groq Whisper:", err);
      }
    };

    try {
      recorder.stop();
    } catch (_) { }
  }

  async startMicrophone() {
    if (this.hasStartedMic) return;

    this.onStatus("Starting microphone stream...");

    if (this.externalStream) {
      this.stream = this.externalStream;
      this.ownsStream = false;
    } else {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.ownsStream = true;
    }

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000,
    });
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    const workletCode = `
      class PCMProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.buffer = new Int16Array(4096);
          this.offset = 0;
        }

        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (!input || !input.length) return true;
          const channelData = input[0];
          if (!channelData) return true;

          for (let i = 0; i < channelData.length; i++) {
            let s = Math.max(-1, Math.min(1, channelData[i]));
            this.buffer[this.offset] = s < 0 ? s * 0x8000 : s * 0x7fff;
            this.offset++;

            if (this.offset >= 4096) {
              this.port.postMessage(new Int16Array(this.buffer));
              this.offset = 0;
            }
          }
          return true;
        }
      }
      registerProcessor('pcm-processor', PCMProcessor);
    `;

    const blob = new Blob([workletCode], { type: "application/javascript" });
    const workletUrl = URL.createObjectURL(blob);

    await this.audioContext.audioWorklet.addModule(workletUrl);

    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-processor");

    this.inputSilenceGain = this.audioContext.createGain();
    this.inputSilenceGain.gain.value = 0;

    this.workletNode.port.onmessage = (event) => {
      if (
        this.isMuted ||
        !this.ws ||
        this.ws.readyState !== WebSocket.OPEN ||
        !this.hasStartedMic
      ) {
        return;
      }

      if (this.ws.bufferedAmount > 1_500_000) return;

      const pcm16 = event.data;
      const base64 = arrayBufferToBase64(pcm16.buffer);

      this.ws.send(
        JSON.stringify({
          type: "audio",
          data: base64,
        })
      );
    };

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.inputSilenceGain);
    this.inputSilenceGain.connect(this.audioContext.destination);

    this.hasStartedMic = true;

    // Start turn recording for user transcription
    this.startUserTurnRecording();

    this.onStatus("Listening...");
  }

  async playPcmAudio(base64Audio, mimeType = "audio/pcm;rate=24000") {
    try {
      const sampleRate = parseRateFromMimeType(mimeType, 24000);
      const playbackContext = this.ensurePlaybackContext(sampleRate);

      if (playbackContext.state === "suspended") {
        await playbackContext.resume();
      }

      const arrayBuffer = base64ToArrayBuffer(base64Audio);
      const int16 = new Int16Array(arrayBuffer);

      if (!int16.length) return;

      const audioBuffer = playbackContext.createBuffer(1, int16.length, sampleRate);
      const channel = audioBuffer.getChannelData(0);

      for (let i = 0; i < int16.length; i++) {
        channel[i] = int16[i] / 32768;
      }

      const source = playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playbackContext.destination);

      if (this.playbackDestination) {
        source.connect(this.playbackDestination);
      }

      const now = playbackContext.currentTime;
      let startTime;

      if (this.nextPlaybackTime > now) {
        startTime = this.nextPlaybackTime;
      } else {
        startTime = now + this.playbackLeadTime;
      }

      this.nextPlaybackTime = startTime + audioBuffer.duration;
      source.start(startTime);

      this.audioChunkCounter += 1;
      this.activeAudioSources.add(source);
      this.isAssistantCurrentlySpeaking = true;

      source.onended = () => {
        this.activeAudioSources.delete(source);
        if (this.activeAudioSources.size === 0) {
          this.isAssistantCurrentlySpeaking = false;
          // FIX: The audio physically finished playing. It is now safe to turn the mic back on!
          this.startUserTurnRecording();
        }
      };
    } catch (error) {
      console.warn("Gemini audio playback failed:", error);
    }
  }

  async handleBackendMessage(event) {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    this.onEvent(data);

    if (data.type === "heartbeat" || data.type === "heartbeat_ack") return;
    if (data.type === "status") { this.onStatus(data.message || "Gemini Live status update."); return; }
    if (data.type === "error") { this.onError(new Error(data.message || "Gemini Live backend error.")); return; }

    if (data.type === "setup_complete") {
      this.onStatus("Gemini Live ready. Starting microphone...");
      await this.startMicrophone();
      this.safeResolve();
      return;
    }

    if (data.type === "user_transcript") {
      const text = String(data.text || "").trim();
      if (!text) return;
      this.onUserText(text, { type: "final", source: "groq" });
      return;
    }

    if (data.type === "audio" && data.data) {
      this.finishUserTurnRecording();
      if (this.activeAudioSources.size > 0 && this.audioChunkCounter === 0) {
        this.stopAllScheduledAssistantAudio();
      }
      this.onStatus("Jarvis speaking...");
      this.onAudio(data);
      await this.playPcmAudio(data.data, data.mimeType);
      return;
    }

    if (data.type === "transcript") {
      const text = String(data.text || "").trim();
      if (!text) return;
      this.onTranscript({ role: data.role, text, rawEvent: data.raw });
      if (data.role === "user") {
        this.onUserText(text, data);
      } else {
        this.onAssistantText(text, false, data);
      }
      return;
    }

    if (data.type === "interrupted") {
      this.stopAllScheduledAssistantAudio();
      this.audioResponseGeneration += 1;
      this.audioChunkCounter = 0;
      this.onStatus("Gemini interrupted. Listening...");
      this.startUserTurnRecording();
      return;
    }

    if (data.type === "turn_complete") {
      this.audioChunkCounter = 0;
      this.onStatus("Listening...");
      this.onTurnComplete(data);
      // FIX: Only restart mic here if Gemini replied with text but NO audio. 
      // If audio is playing, source.onended will safely restart the mic later.
      if (!this.isAssistantCurrentlySpeaking) {
        this.startUserTurnRecording();
      }
    }
  }

  sendText(text) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;

    this.ws.send(
      JSON.stringify({
        type: "text",
        text,
      })
    );

    return true;
  }

  sendCodeSnapshot(code, meta = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;

    this.ws.send(
      JSON.stringify({
        type: "code_snapshot",
        code,
        meta,
      })
    );

    return true;
  }

  mute() {
    this.isMuted = true;
    this.finishUserTurnRecording();
    this.stream?.getAudioTracks()?.forEach((track) => {
      track.enabled = false;
    });
  }

  unmute() {
    this.isMuted = false;
    this.stream?.getAudioTracks()?.forEach((track) => {
      track.enabled = true;
    });
    this.startUserTurnRecording();
  }

  disconnect() {
    this.closedByUser = true;
    this.stopHeartbeat();

    this.finishUserTurnRecording();

    try { clearTimeout(this.connectionTimeout); } catch (_) { }
    try { clearTimeout(this.speechEndTimer); } catch (_) { }
    try { clearTimeout(this.schedulerResetTimer); } catch (_) { }

    this.stopAllScheduledAssistantAudio();

    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "end" }));
      }
    } catch (_) { }

    try { this.ws?.close(); } catch (_) { }
    try { this.workletNode?.disconnect(); } catch (_) { }
    try { this.sourceNode?.disconnect(); } catch (_) { }
    try { this.inputSilenceGain?.disconnect(); } catch (_) { }

    if (this.ownsStream) {
      try { this.stream?.getTracks()?.forEach((track) => track.stop()); } catch (_) { }
    }

    try { this.audioContext?.close(); } catch (_) { }
    try { this.playbackContext?.close(); } catch (_) { }

    this.ws = null;
    this.stream = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.inputSilenceGain = null;
    this.playbackContext = null;
    this.playbackDestination = null;
    this.userMediaRecorder = null;
    this.userAudioChunks = [];
    this.isConnected = false;
    this.hasStartedMic = false;
    this.nextPlaybackTime = 0;
    this.lastAudioChunkAt = 0;
    this.audioChunkCounter = 0;
    this.activeAudioSources = new Set();
    this.isAssistantCurrentlySpeaking = false;

    this.onStatus("Gemini Live stopped.");
  }
}