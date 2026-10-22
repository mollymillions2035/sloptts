// Kokoro TTS engine for Chrome. Chrome hands each utterance to onSpeak; it goes to the
// native messaging host (chrome/kokoro-chrome-host), which fetches the audio from the
// Kokoro server and plays it with pw-play, and reports start and end back.

const HOST = "sloptts.kokoro";
// Chrome keeps the host (and this worker) running while the port is open
const IDLE_MS = 5 * 60 * 1000;

// Voice names in manifest.json -> Kokoro voices
const VOICES = {
  "Kokoro Heart (not Google)": "af_heart",
  "Kokoro Bella (not Google)": "af_bella",
  "Kokoro Michael (not Google)": "am_michael",
  "Kokoro Fenrir (not Google)": "am_fenrir",
  "Kokoro Emma (not Google)": "bf_emma",
  "Kokoro George (not Google)": "bm_george",
};

let port = null;
let current = null; // {id, length, sendTtsEvent}
let nextId = 0;
let idleTimer = null;

function connect() {
  port = chrome.runtime.connectNative(HOST);
  port.onMessage.addListener(onHostMessage);
  port.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message || "the Kokoro host exited";
    port = null;
    finish({type: "error", errorMessage: `Kokoro: ${error}`});
  });
}

// For the host's debug log (see kokoro-chrome-host); ignored unless that's on
function log(what, details = {}) {
  if (port) port.postMessage({type: "log", what, current: current?.id ?? null, ...details});
}

function post(message) {
  clearTimeout(idleTimer);
  if (!port) connect();
  port.postMessage(message);
}

// Report the utterance's last event (none when Chrome stopped it) and let the host go
// once we've been idle a while
function finish(event) {
  if (current && event) current.sendTtsEvent(event);
  current = null;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!current && port) {
      port.disconnect();
      port = null;
    }
  }, IDLE_MS);
}

function onHostMessage(message) {
  if (!current || message.id !== current.id) {
    log("dropped host event", {event: message.event, id: message.id});
    return; // a stopped utterance
  }
  switch (message.event) {
    case "end":
      finish({type: "end", charIndex: current.length});
      break;
    case "error":
      finish({type: "error", errorMessage: `Kokoro: ${message.message}`});
      break;
    case "start":
      current.sendTtsEvent({type: "start", charIndex: 0});
      // Reading mode resumes from its last word boundary when the voice reports
      // any; without one it calls speechSynthesis.resume(), which hangs if the
      // paused sentence was cancelled in between (say, by a voice preview). We
      // have no word timings yet, so the whole utterance is one "word": resuming
      // replays the sentence.
      current.sendTtsEvent({type: "word", charIndex: 0, length: current.length});
  }
}

chrome.ttsEngine.onSpeak.addListener((text, options, sendTtsEvent) => {
  const voice = VOICES[options.voiceName] || (/^en-GB/i.test(options.lang || "") ? "bf_emma" : "af_heart");
  current = {id: ++nextId, length: text.length, sendTtsEvent};
  post({
    type: "speak",
    id: current.id,
    text,
    voice,
    speed: options.rate ?? 1,
    volume: options.volume ?? 1,
  });
  log("onSpeak", {voiceName: options.voiceName, lang: options.lang, rate: options.rate, chars: text.length});
});

chrome.ttsEngine.onStop.addListener(() => {
  log("onStop");
  if (!current) return;
  finish(null);
  if (port) port.postMessage({type: "stop"});
});

chrome.ttsEngine.onPause.addListener(() => {
  log("onPause");
  if (current && port) port.postMessage({type: "pause"});
});

chrome.ttsEngine.onResume.addListener(() => {
  log("onResume");
  if (current && port) port.postMessage({type: "resume"});
});
