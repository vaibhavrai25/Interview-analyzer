import { io } from "socket.io-client";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://127.0.0.1:8000";

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  path: "/socket.io/",
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
});

let listenersRegistered = false;

const registerDebugListeners = () => {
  if (listenersRegistered) return;

  listenersRegistered = true;

  socket.on("connect", () => {
    console.log("Neural Link Connected:", socket.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("Neural Link Disconnected:", reason);
  });

  socket.on("connect_error", (error) => {
    console.error("Neural Link Connection Error:", error.message);
  });

  socket.on("error", (error) => {
    console.error("Neural Link Runtime Error:", error);
  });

  socket.on("connection_ack", (data) => {
    console.log("Neural Link Ack:", data);
  });
};

export const connectSocket = (interviewConfig = {}) => {
  registerDebugListeners();

  socket.auth = {
    config: interviewConfig || {},
  };

  if (socket.connected) {
    console.log("Neural Link already connected:", socket.id);
    return socket;
  }

  if (socket.active) {
    console.log("Neural Link already connecting...");
    return socket;
  }

  console.log("Connecting Neural Link...");
  socket.connect();

  return socket;
};

export const disconnectSocket = () => {
  if (!socket.connected && !socket.active) {
    console.log("Neural Link already disconnected");
    return;
  }

  console.log("Neural Link Terminated");
  socket.disconnect();
};

export const emitCodeUpdate = (code, config = {}) => {
  if (!socket.connected) {
    console.warn("Cannot emit code_update. Socket not connected.");
    return false;
  }

  socket.emit("code_update", {
    code: code || "",
    config: config || {},
    client_timestamp: Date.now(),
  });

  return true;
};

export const emitUserAnswer = (text, code = "", config = {}) => {
  if (!socket.connected) {
    console.warn("Cannot emit user_answer. Socket not connected.");
    return false;
  }

  socket.emit("user_answer", {
    text: text || "",
    code: code || "",
    config: config || {},
    client_timestamp: Date.now(),
  });

  return true;
};

export default socket;