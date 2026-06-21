import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { loader } from "@monaco-editor/react";

// Use a stable CDN path for Monaco Editor
loader.config({
  paths: {
    vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs",
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(<App />);