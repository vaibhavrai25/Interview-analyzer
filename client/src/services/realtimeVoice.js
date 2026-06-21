const OPENAI_REALTIME_WEBRTC_URL = "https://api.openai.com/v1/realtime/calls";

export class RealtimeVoiceClient {
  constructor({
    sessionData,
    interviewId,
    onStatus,
    onTranscript,
    onAssistantText,
    onUserText,
    onError,
    onEvent,
  }) {
    this.sessionData = sessionData;
    this.interviewId = interviewId;

    this.onStatus = onStatus || (() => {});
    this.onTranscript = onTranscript || (() => {});
    this.onAssistantText = onAssistantText || (() => {});
    this.onUserText = onUserText || (() => {});
    this.onError = onError || (() => {});
    this.onEvent = onEvent || (() => {});

    this.pc = null;
    this.dc = null;
    this.audioEl = null;
    this.localStream = null;
    this.isConnected = false;

    this.assistantTextBuffer = "";
    this.assistantAudioTranscriptBuffer = "";
  }

  getEphemeralKey() {
    const secret =
      this.sessionData?.session?.value ||
      this.sessionData?.session?.client_secret?.value ||
      this.sessionData?.session?.client_secret ||
      this.sessionData?.client_secret?.value ||
      this.sessionData?.client_secret;

    if (!secret) {
      console.error("Realtime session payload:", this.sessionData);
      throw new Error("Realtime ephemeral client secret missing.");
    }

    return secret;
  }

  async connect() {
    try {
      this.onStatus("Requesting microphone...");

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.onStatus("Creating realtime WebRTC connection...");

      this.pc = new RTCPeerConnection();

      this.audioEl = document.createElement("audio");
      this.audioEl.autoplay = true;
      this.audioEl.style.display = "none";
      document.body.appendChild(this.audioEl);

      this.pc.ontrack = (event) => {
        this.audioEl.srcObject = event.streams[0];
      };

      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState || "unknown";
        this.onStatus(`WebRTC state: ${state}`);

        if (state === "failed" || state === "disconnected") {
          this.onError(new Error(`Realtime WebRTC ${state}`));
        }
      };

      this.localStream.getTracks().forEach((track) => {
        this.pc.addTrack(track, this.localStream);
      });

      this.dc = this.pc.createDataChannel("oai-events");

      this.dc.onopen = () => {
        this.isConnected = true;
        this.onStatus("Realtime voice connected.");

        this.sendEvent({
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            instructions:
              "Greet the candidate warmly and ask them to introduce themselves briefly.",
          },
        });
      };

      this.dc.onclose = () => {
        this.isConnected = false;
        this.onStatus("Realtime voice disconnected.");
      };

      this.dc.onerror = (error) => {
        console.error("Realtime data channel error:", error);
        this.onError(error);
      };

      this.dc.onmessage = (event) => {
        this.handleServerEvent(event);
      };

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      const ephemeralKey = this.getEphemeralKey();

      this.onStatus("Sending SDP offer to OpenAI realtime call endpoint...");

      const sdpResponse = await fetch(OPENAI_REALTIME_WEBRTC_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        const text = await sdpResponse.text();
        throw new Error(`Realtime WebRTC failed: ${text}`);
      }

      const answerSdp = await sdpResponse.text();

      await this.pc.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });

      this.onStatus("Realtime interview started.");
    } catch (error) {
      console.error("Realtime connect error:", error);
      this.onError(error);
      this.disconnect();
      throw error;
    }
  }

  sendEvent(payload) {
    if (!this.dc || this.dc.readyState !== "open") {
      return false;
    }

    this.dc.send(JSON.stringify(payload));
    return true;
  }

  handleServerEvent(event) {
    let data;

    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    this.onEvent(data);

    const type = data.type || "";

    if (type === "response.output_text.delta") {
      const delta = data.delta || "";
      this.assistantTextBuffer += delta;
      this.onAssistantText(this.assistantTextBuffer, false, data);
    }

    if (type === "response.output_text.done") {
      const text = data.text || this.assistantTextBuffer;
      this.onAssistantText(text, true, data);
      this.assistantTextBuffer = "";
    }

    if (type === "response.text.delta") {
      const delta = data.delta || "";
      this.assistantTextBuffer += delta;
      this.onAssistantText(this.assistantTextBuffer, false, data);
    }

    if (type === "response.text.done") {
      const text = data.text || this.assistantTextBuffer;
      this.onAssistantText(text, true, data);
      this.assistantTextBuffer = "";
    }

    if (
      type === "response.output_audio_transcript.delta" ||
      type === "response.audio_transcript.delta"
    ) {
      const delta = data.delta || "";
      this.assistantAudioTranscriptBuffer += delta;
      this.onAssistantText(this.assistantAudioTranscriptBuffer, false, data);
    }

    if (
      type === "response.output_audio_transcript.done" ||
      type === "response.audio_transcript.done"
    ) {
      const text = data.transcript || this.assistantAudioTranscriptBuffer;
      this.onAssistantText(text, true, data);
      this.assistantAudioTranscriptBuffer = "";
    }

    if (
      type === "conversation.item.input_audio_transcription.completed" ||
      type === "input_audio_transcription.completed"
    ) {
      const text = data.transcript || "";
      this.onUserText(text, data);
      this.onTranscript({
        role: "user",
        text,
        rawEvent: data,
      });
    }

    if (type === "error") {
      console.error("Realtime server error:", data);
      this.onError(data);
    }
  }

  mute() {
    this.localStream?.getAudioTracks()?.forEach((track) => {
      track.enabled = false;
    });
  }

  unmute() {
    this.localStream?.getAudioTracks()?.forEach((track) => {
      track.enabled = true;
    });
  }

  disconnect() {
    try {
      this.dc?.close();
    } catch (_) {}

    try {
      this.pc?.close();
    } catch (_) {}

    try {
      this.localStream?.getTracks()?.forEach((track) => track.stop());
    } catch (_) {}

    try {
      if (this.audioEl && this.audioEl.parentNode) {
        this.audioEl.parentNode.removeChild(this.audioEl);
      }
    } catch (_) {}

    this.dc = null;
    this.pc = null;
    this.localStream = null;
    this.audioEl = null;
    this.isConnected = false;

    this.onStatus("Realtime voice stopped.");
  }
}