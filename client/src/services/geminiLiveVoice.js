const DEFAULT_BACKEND_URL =
  process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

function backendToWsUrl(baseUrl) {
  if (baseUrl.startsWith("https://")) return baseUrl.replace("https://", "wss://");
  if (baseUrl.startsWith("http://")) return baseUrl.replace("http://", "ws://");
  return baseUrl;
}

// Converts standard ArrayBuffer to Base64 for the websocket payload
// when we take the mic input, convert audio to PCM16, and send it to the backend, we need to encode it as Base64 to send it over the websocket as a string. The backend will decode it back to PCM16 for processing.
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

// Converts Base64 incoming payload from WebSocket to ArrayBuffer for audio decoding 
// websocket send data as string but browser audio APIs require ArrayBuffer to play the audio
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

// Safely extracts the sample rate from Gemini's incoming mimeType (usually 24000)

function parseRateFromMimeType(mimeType, fallback = 24000) {
  const match = String(mimeType || "").match(/rate=(\d+)/);
  if (!match) return fallback;
  return Number(match[1]) || fallback;
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

    this.onStatus = onStatus || (() => {});
    this.onTranscript = onTranscript || (() => {});
    this.onAssistantText = onAssistantText || (() => {});
    this.onUserText = onUserText || (() => {});
    this.onAudio = onAudio || (() => {});
    this.onTurnComplete = onTurnComplete || (() => {});
    this.onError = onError || (() => {});
    this.onEvent = onEvent || (() => {});

    this.ws = null;
    this.stream = null;
    this.ownsStream = false;

    // Speech Recognition Instance for real-time user chat bubbles
    this.speechRecognition = null;

    // Mic processing nodes
    this.audioContext = null;
    this.sourceNode = null;
    this.workletNode = null; // Replaced processorNode with workletNode
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
  // Safely initializes the Web Audio API only when needed to bypass browser autoplay restrictions and resets the audio scheduler clock.
  ensurePlaybackContext(sampleRate = 24000) {
    if (!this.playbackContext || this.playbackContext.state === "closed") {
      this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
      this.playbackDestination = this.playbackContext.createMediaStreamDestination();
      this.nextPlaybackTime = 0;
      this.activeAudioSources = new Set();
    }
    return this.playbackContext;
  }
  // Routes the AI's raw audio into a flexible virtual stream so your React frontend can easily play it, mute it, or visualize it using a standard <audio> element.
  getAssistantAudioStream() {
    this.ensurePlaybackContext(24000);
    return this.playbackDestination.stream;
  }
  //Sends a tiny, automated message to the server every 8 seconds to prevent network firewalls from disconnecting the WebSocket during silent periods of the interview.
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "heartbeat", at: Date.now() }));
        }
      } catch (_) {}
    }, 8000);
  }
  // this function stops the heartbeat timer that was started to keep the WebSocket connection alive. It clears the interval and sets the heartbeatTimer to null.
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  // This function marks the assistant as currently speaking and sets a fallback timer to reset the speaking state if no audio sources are active after 1.2 seconds. It clears any existing speech end timer before setting a new one.
  markAssistantSpeaking() {
    this.isAssistantCurrentlySpeaking = true;

    clearTimeout(this.speechEndTimer);

    // Fallback timer just in case audio buffer events get swallowed
    this.speechEndTimer = setTimeout(() => {
      if (this.activeAudioSources.size === 0) {
        this.isAssistantCurrentlySpeaking = false;
      }
    }, 1200);
  }
  // This function resets the playback scheduler after a short delay of 700 milliseconds. 
  // It clears any existing scheduler reset timer and sets a new one. 
  // If there are no active audio sources when the timer fires, it resets the next playback time to 0 and marks that the assistant is not currently speaking.
  resetPlaybackSchedulerSoon() {
    clearTimeout(this.schedulerResetTimer);

    this.schedulerResetTimer = setTimeout(() => {
      if (this.activeAudioSources.size === 0) {
        this.nextPlaybackTime = 0;
        this.isAssistantCurrentlySpeaking = false;
      }
    }, 700);
  }
  // This function stops all currently scheduled assistant audio playback. 
  // It increments the audio response generation counter, stops each active audio source, clears the set of active audio sources, resets the next playback time and audio chunk counter, and marks that the assistant is not currently speaking.
  //  It also clears any existing speech end and scheduler reset timers.
  stopAllScheduledAssistantAudio() {
    this.audioResponseGeneration += 1;

    for (const source of this.activeAudioSources) {
      try {
        source.onended = null;
        source.stop(0);
      } catch (_) {}
    }

    this.activeAudioSources.clear();
    this.nextPlaybackTime = 0;
    this.audioChunkCounter = 0;
    this.isAssistantCurrentlySpeaking = false;

    clearTimeout(this.speechEndTimer);
    clearTimeout(this.schedulerResetTimer);
  }

  async connect() {
    // If the WebSocket is already open, we don't need to reconnect.
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    

    // Reset connection state
    this.closedByUser = false;
    this.audioResponseGeneration = 0;
    this.audioChunkCounter = 0;
    this.nextPlaybackTime = 0;
    this.onStatus("Opening Gemini backend WebSocket...");
    // Return a promise that resolves when the connection is established or rejects on error/timeout
    return new Promise((resolve, reject) => {
      this.connectPromiseResolve = resolve;
      this.connectPromiseReject = reject;
      // Set a timeout to reject the promise if the connection doesn't establish within 35 seconds
      this.connectionTimeout = setTimeout(() => {
        if (!this.hasStartedMic) {
          const error = new Error("Gemini backend WebSocket timeout.");
          console.error("Connection Timeout:", error.message);
          this.onError(error);
          this.safeReject(error);
          this.disconnect();
        }
      }, 35000);
      // Initialize the WebSocket connection to the backend
      this.ws = new WebSocket(this.getWsUrl());
      // Set up event handlers for the WebSocket
      this.ws.onopen = () => {
        this.isConnected = true;
        this.startHeartbeat();
        this.onStatus("Backend WebSocket connected. Sending Gemini setup...");

        console.log(" Client WS connected, sending start message");
        // Send a "start" message to the backend with user email and configuration
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
      // Handle incoming messages from the backend WebSocket
      this.ws.onmessage = async (event) => {
        await this.handleBackendMessage(event);

        if (this.isConnected && this.hasStartedMic) {
          clearTimeout(this.connectionTimeout);
          this.safeResolve();
        }
      };
      // Handle WebSocket errors by logging them, invoking the onError callback, and rejecting the connection promise if the connection wasn't closed by the user.
      this.ws.onerror = (error) => {
        console.error("❌ Gemini backend WS error:", error);
        if (!this.closedByUser) {
          this.onError(error);
          this.safeReject(new Error("Gemini backend WebSocket error."));
        }
      };
      // Handle WebSocket closure by updating connection state, stopping the heartbeat, and invoking the onError callback if the connection was closed before the microphone started.
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
  // Safely resolves the connection promise if it exists, and clears the resolve and reject handlers to prevent multiple invocations.
  safeResolve() {
    if (this.connectPromiseResolve) {
      this.connectPromiseResolve();
      this.connectPromiseResolve = null;
      this.connectPromiseReject = null;
    }
  }
  // Safely rejects the connection promise if it exists, and clears the resolve and reject handlers to prevent multiple invocations.
  safeReject(error) {
    if (this.connectPromiseReject) {
      this.connectPromiseReject(error);
      this.connectPromiseResolve = null;
      this.connectPromiseReject = null;
    }
  }
  // This function initializes the browser's SpeechRecognition API to capture and transcribe user speech in real-time.
  //  It sets up event handlers for processing interim and final transcripts, sending them to the backend, and handling errors. 
  // The function also ensures continuous recognition by restarting the recognition process if it ends unexpectedly.
  startSpeechRecognition() {
    // Check if the browser supports the SpeechRecognition API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    this.speechRecognition = new SpeechRecognition();
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = true;
    

    // Handle the results from the speech recognition API, processing both interim and final transcripts.
    //  Interim transcripts are sent to the onUserText callback with a type of "interim", while final transcripts are sent with a type of "final" and also logged to the backend if the WebSocket is open.
    this.speechRecognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";


      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      if (interimTranscript) {
        this.onUserText(interimTranscript.trim(), { type: "interim" });
      }
      // If a final transcript is available, send it to the onUserText callback and log it to the backend if the WebSocket is open.
      if (finalTranscript.trim()) {
        this.onUserText(finalTranscript.trim(), { type: "final" });
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "user_transcript_log", text: finalTranscript.trim() }));
        }
      }
    };

    this.speechRecognition.onerror = (event) => {
      if (event.error === "no-speech") return;
      if (event.error === "aborted") return;
      console.warn("Speech recognition issue:", event.error);
    };

    this.speechRecognition.onend = () => {
      if (!this.closedByUser && this.hasStartedMic) {
        setTimeout(() => {
          if (!this.closedByUser && this.hasStartedMic) {
            try {
              this.speechRecognition.start();
            } catch (err) {}
          }
        }, 50);
      }
    };

    try {
      this.speechRecognition.start();
    } catch (err) {
      console.warn("Could not start SpeechRecognition:", err);
    }
  }

  async startMicrophone() {
    if (this.hasStartedMic) return;

    this.onStatus("Starting microphone stream...");
    // If an external stream is provided, use it; otherwise, request microphone access from the user.
    if (this.externalStream) {
      this.stream = this.externalStream;
      this.ownsStream = false;
    } else {
      // Request microphone access from the user with specific audio constraints for echo cancellation, noise suppression, and auto gain control.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        // Disable video to avoid unnecessary permissions and resource usage
        video: false,
      });
      // Mark that this client owns the microphone stream and is responsible for stopping it when done.
      this.ownsStream = true;
    }

    // Force the browser to initialize native 16000Hz sampling
    // why: Gemini backend expects 16kHz PCM audio for processing, and this ensures that the audio context is set up correctly for that sample rate.
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    
    // --- WORKLET INJECTION (Replaces Deprecated ScriptProcessorNode) ---
    // This runs the Float32 -> Int16 conversion and chunks it perfectly to 4096 samples 
    // on a dedicated background C++ thread, preventing main-thread UI lag and throttling.
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
              // Send an exact copy of the buffer to the main thread
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
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

    this.inputSilenceGain = this.audioContext.createGain();
    this.inputSilenceGain.gain.value = 0;

    // Handle messages coming from the Worklet thread
    this.workletNode.port.onmessage = (event) => {
      if (
        this.isMuted ||
        !this.ws ||
        this.ws.readyState !== WebSocket.OPEN ||
        !this.hasStartedMic
      ) {
        return;
      }

      // Overload protection
      if (this.ws.bufferedAmount > 1_500_000) return;

      const pcm16 = event.data; // Int16Array from the background thread
      const base64 = arrayBufferToBase64(pcm16.buffer);

      this.ws.send(
        JSON.stringify({
          type: "audio",
          data: base64,
        })
      );
    };

    // Connect nodes
    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.inputSilenceGain);
    this.inputSilenceGain.connect(this.audioContext.destination);

    this.hasStartedMic = true;
    
    // Start local speech recognition for UI transcribing
    this.startSpeechRecognition();

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

      // Convert 16-bit PCM to Float32 for Web Audio API
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
        }
      };
    } catch (error) {
      console.warn("Gemini audio playback failed:", error);
    }
  }

  async handleBackendMessage(event) {
    let data;

    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    this.onEvent(data);

    if (data.type === "heartbeat" || data.type === "heartbeat_ack") {
      return;
    }

    if (data.type === "status") {
      this.onStatus(data.message || "Gemini Live status update.");
      return;
    }

    if (data.type === "error") {
      const error = new Error(data.message || "Gemini Live backend error.");
      this.onError(error);
      return;
    }

    if (data.type === "setup_complete") {
      this.onStatus("Gemini Live ready. Starting microphone...");
      await this.startMicrophone();
      this.safeResolve();
      return;
    }

    if (data.type === "audio" && data.data) {
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

      this.onTranscript({
        role: data.role,
        text,
        rawEvent: data.raw,
      });

      if (data.role === "user") {
        this.onUserText(text, data);
      } else {
        this.onAssistantText(text, false, data);
      }

      return;
    }

    if (data.type === "interrupted") {
      // Backend detected user barge-in! Clear AI audio immediately.
      this.stopAllScheduledAssistantAudio();
      this.audioResponseGeneration += 1;
      this.audioChunkCounter = 0;
      this.onStatus("Gemini interrupted. Listening...");
      return;
    }

    if (data.type === "turn_complete") {
      this.audioChunkCounter = 0;
      this.onStatus("Listening...");
      this.onTurnComplete(data);
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
    this.stream?.getAudioTracks()?.forEach((track) => {
      track.enabled = false;
    });
  }

  unmute() {
    this.isMuted = false;
    this.stream?.getAudioTracks()?.forEach((track) => {
      track.enabled = true;
    });
  }

  disconnect() {
    this.closedByUser = true;
    this.stopHeartbeat();

    if (this.speechRecognition) {
      try {
        this.speechRecognition.onend = null;
        this.speechRecognition.onerror = null;
        this.speechRecognition.stop();
      } catch (e) {}
    }

    try { clearTimeout(this.connectionTimeout); } catch (_) {}
    try { clearTimeout(this.speechEndTimer); } catch (_) {}
    try { clearTimeout(this.schedulerResetTimer); } catch (_) {}

    this.stopAllScheduledAssistantAudio();

    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "end" }));
      }
    } catch (_) {}

    try { this.ws?.close(); } catch (_) {}
    try { this.workletNode?.disconnect(); } catch (_) {}
    try { this.sourceNode?.disconnect(); } catch (_) {}
    try { this.inputSilenceGain?.disconnect(); } catch (_) {}

    if (this.ownsStream) {
      try { this.stream?.getTracks()?.forEach((track) => track.stop()); } catch (_) {}
    }

    try { this.audioContext?.close(); } catch (_) {}
    try { this.playbackContext?.close(); } catch (_) {}

    this.ws = null;
    this.stream = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.inputSilenceGain = null;
    this.playbackContext = null;
    this.playbackDestination = null;
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