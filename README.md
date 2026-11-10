# slopvoice
Note from the human who told claude to make this: THIS IS PURE SLOP. I HAVE NOT READ THE CODE. UPLOADED FOR REFERENCES PURPOSES ONLY. I HIGHLY RECOMMEND YOU DO NOT ATTEMPT TO USE THIS AS-IS.

Local, high-quality text-to-speech with **Kokoro-82M** (voice `af_heart`) through
[kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx), with English phonemization by
[Misaki](https://github.com/hexgrad/misaki). A small server keeps the model loaded and streams
audio over a Unix socket. Clients send it text:

- **`kokoro-speak`**: speak the highlighted text, the clipboard, an argument or stdin. On
  Omarchy it is bound to a key (press again to stop).
- **Chrome extension** (`chrome/`): Kokoro voices for Chrome and Chromium, for Reading
  mode's "Read aloud" and any page using the Web Speech API.
- **`sd_kokoro`**: a Speech Dispatcher module, for `spd-say`, Orca and (the older route)
  Chrome.

It started on Fedora Silverblue (see [Fedora](#fedora-silverblue-the-original-setup)) and
now has an installer for [Omarchy](https://omarchy.org/) (Arch + Hyprland).

## Layout

| Path | What it is |
|---|---|
| `server/server.py` | The TTS server. Protocol: one JSON line `{"text","voice","speed"}` in, raw 24 kHz mono float32 PCM out until the server closes the connection. A client disconnecting stops synthesis. Normalizes dots that espeak-ng would read as sentence ends (`5.5.`, `1.2.3`, `example.com`, `e.g.`, `Mr.`), and turns rendered math into words: math letters (`𝜋`, `𝑟`, `ℝ`), powers, fractions, derivatives, limits, integral and sum bounds, absolute values, factorials, primes, accents, and the symbols espeak-ng skips or misreads. |
| `server/misaki_g2p.py` | English Misaki G2P with eSpeak fallback for unknown words. en-US loads with the server; en-GB loads lazily for the first British voice (`en-UK` is accepted as an alias). |
| `server/say.py` | Standalone script to compare voices (`say.py VOICE "text" [--speed] [--out f.wav] [--list]`). |
| `bin/kokoro-speak` | Client for keys, the bar button and scripts. Sends the whole text in one request into one `pw-play`, so there's no start-up gap between sentences. Only one instance speaks at a time. Its PipeWire stream is named `kokoro-speak` ("Kokoro TTS" in mixers). |
| `chrome/extension/` | Chrome/Chromium extension (Manifest V3) registering six Kokoro voices (Heart, Bella, Michael, Fenrir: en-US; Emma, George: en-GB), named like `Kokoro Heart (not Google)`, as a `ttsEngine`. Its fixed `key` gives it the ID `imfdenmcpjfjjcbkhpbgldooiijflami`. |
| `chrome/kokoro-chrome-host` | The extension's native messaging host (Python, standard library only): one server request and one `pw-play` per utterance (stream `kokoro-chrome`); stop, pause and resume. Touch `~/.config/kokoro-tts/chrome-debug` to log the conversation with Chrome to `$XDG_RUNTIME_DIR/kokoro-chrome-host.log`. |
| `speechd/sd_kokoro` | Speech Dispatcher output module (Python, standard library only). Pause, resume and stop cut off immediately, and index marks are reported as sentences finish. |
| `omarchy/install.sh` | Omarchy installer (details below). |
| `omarchy/kokoro-tts.service` | The `kokoro-tts` user unit (runs `server.py` from the venv). |
| `omarchy/bindings.lua` | Template for the Hyprland keys block. |
| `omarchy/bar-widget/` | The `sloptts.speak` Omarchy shell plugin: a bar button that runs `kokoro-speak`, and turns into a stop button while a `kokoro-speak` stream is playing. |
| `fedora/` | The original Fedora Silverblue setup: distrobox unit, `speechd.conf`, `sd_generic` config, Chrome launcher, Orca settings, libspiel RPM spec, backups. |

Paths and environment used by all parts:

| | Default | Override |
|---|---|---|
| Socket | `$XDG_RUNTIME_DIR/kokoro-tts/kokoro-tts.sock` | `KOKORO_SOCKET` |
| Model files | next to `server.py` | `KOKORO_MODEL_DIR` |
| Log the spoken text | off | `KOKORO_LOG_TEXT=1` (in `~/.config/kokoro-tts/env` on Omarchy) |
| Extra silence between paragraphs (blank lines) | 0.4 s (~0.55 s gap; sentences ~0.3 s) | `KOKORO_PARAGRAPH_PAUSE=0.6` (same file) |

## Omarchy

```bash
git clone https://github.com/mollymillions2035/sloptts && cd sloptts
./omarchy/install.sh                 # server, kokoro-speak, keys
./omarchy/install.sh --with-speechd  # additionally: Speech Dispatcher + Chrome Read aloud
./omarchy/install.sh --uninstall
```

Then select some text and press **Alt + Shift + Space**. Press it again to stop.
**Super + Alt + Shift + Space** reads the clipboard.

With the mouse only: select text, then click the **Speak** button in the bar (the
speaking-person icon, left of the volume icon). Right-click it to read the clipboard
instead, for example after right-click → Copy. While anything is being read, by key or by
click, the button turns into a red stop square; click it to stop.

**Chrome / Chromium Reading mode:** once per browser profile, open `chrome://extensions`,
turn on **Developer mode**, click **Load unpacked** and pick
`~/.local/share/kokoro-tts/chrome-extension`. Then open Reading mode (right-click a page →
**Open in reading mode**), pick a **Kokoro … (not Google)** voice in its voice menu and press
play. After updating the extension's files, click its reload button in `chrome://extensions`.
Pages that use `speechSynthesis` get the Kokoro voices too.

### What the installer does

1. **Checks the keys first.** If Alt+Shift+Space or Super+Alt+Shift+Space is already bound
   (`hyprctl binds`), it stops and names the binding. Change `KEY_*` at the top of the
   script to pick others, or pass `--no-bindings`.
2. **Downloads the model** (`kokoro-v1.0.onnx` and `voices-v1.0.bin`, 350 MB) from
   kokoro-onnx's `model-files-v1.1` release to `~/.local/share/kokoro-tts/`, checking
   each file's SHA-256. A file that's already there with the right checksum is kept; one
   that doesn't match, such as the older `model-files-v1.0` export of the same model, is
   replaced.
3. **Sets up the server** in a Python 3.12 venv made by `uv` in
   `~/.local/share/kokoro-tts/.venv`, natively (no containers). Python 3.12 is required by the
   current Misaki release:
   - **Misaki English G2P** handles both accents, with eSpeak fallback for unknown words. en-US
     loads at server startup; en-GB loads on the first British voice. The installer preinstalls
     spaCy's `en_core_web_sm` model, so nothing is downloaded on the first request. The optional
     transformer/PyTorch dependencies aren't needed by this configuration and aren't installed.
   - **NVIDIA GPU** (`nvidia-smi -L` works): `onnxruntime-gpu[cuda,cudnn]`, which brings
     the CUDA 13 runtime and cuDNN as pip wheels (about 2.5 GB; needs driver 580+). The
     CPU `onnxruntime` that kokoro-onnx depends on is left out (`uv pip install
     --excludes`), since both install the same module. The installer then checks that
     the model actually loads on CUDA, and uses the CPU if it doesn't. On an RTX 3060
     this runs at about 30x real time (24 s of speech in 1.2 s) and uses about 640 MiB
     of VRAM.
   - **CPU** (no NVIDIA GPU, or `--cpu`): plain `onnxruntime`. On the i7-8700 this runs
     at a real-time factor of about 0.24, which is fine for listening.
   - The venv is recreated when its Python version or onnxruntime build (CPU/GPU)
     differs from what's wanted, instead of swapping one build over the other.
4. **Installs** `kokoro-speak` to `~/.local/bin` and the `kokoro-tts` user service
   (enabled and started).
5. **Adds the keys** as a marked block (`-- >>> sloptts` … `-- <<< sloptts`) at the end of
   `~/.config/hypr/bindings.lua` (after a timestamped backup), then runs
   `hyprctl reload` and `hyprctl configerrors`.
6. **Adds the bar button** (skip with `--no-bar`): copies `omarchy/bar-widget/` to
   `~/.config/omarchy/plugins/sloptts.speak/` and enables it left of the volume icon
   (`omarchy plugin enable sloptts.speak --before omarchy.audio`). On a re-run it updates
   the files but leaves the button wherever it was dragged to.
7. **Sets up the Chrome extension** (skip with `--no-chrome`): copies `chrome/extension/`
   to `~/.local/share/kokoro-tts/chrome-extension/` and the host next to it, and writes the
   native messaging manifest `sloptts.kokoro.json` into `NativeMessagingHosts/` of
   `~/.config/google-chrome` and `~/.config/chromium` (whichever exist). Loading the
   extension is up to you (see above): Chrome doesn't let scripts install unpacked
   extensions.
8. **With `--with-speechd`:**
   - Installs `speech-dispatcher` and `sd_kokoro`.
   - Writes `~/.config/speech-dispatcher/speechd.conf` with kokoro as the only module,
     keeping the original as `speechd.conf.sloptts-orig`.
   - Adds `--enable-speech-dispatcher` to `~/.config/chrome-flags.conf`, which the AUR
     `google-chrome` launcher reads. Quit Chrome fully (**⋮ → Exit**) afterwards.

Packages come from `omarchy pkg add`: `jq`, `wl-clipboard`, `libnotify`, `uv` and
`speech-dispatcher` (optional). Re-running the installer is safe; it replaces its own key
block and unit.

**Versions** (Python, kokoro-onnx, Misaki, onnxruntime and the spaCy model) are set at the top of
`install.sh`. Re-running the installer after changing them upgrades the venv (and its unpinned
dependencies).

### Checking it

```bash
systemctl --user status kokoro-tts
journalctl --user -u kokoro-tts -f   # "providers: CUDAExecutionProvider, ..." on the GPU
kokoro-speak "Hello from Kokoro."
kokoro-speak --voice bf_emma --speed 1.2 "Different voice"
spd-say "hello"                      # with --with-speechd
```

If the key does nothing, a notification tells you why (no text selected, or the server
isn't running).

## How it fits together

```
Hyprland key / bar ─▶ kokoro-speak ─────────────────┐
Chrome ─▶ extension ─▶ kokoro-chrome-host ──────────┤
                                                    ├─ Unix socket ─▶ server.py
spd-say / Orca ─▶ speech-dispatcher ─▶ sd_kokoro ───┘
                                                                      (uv venv, CUDA or CPU)
                                                                      │
      each client plays the PCM it gets back with pw-play ◀───────────┘
```

`sd_kokoro` splits each message at Speech Dispatcher's sentence marks
(`<mark name="__spd_N"/>`). One thread fetches each sentence's audio ahead of playback,
and another writes it to a single `pw-play` and reports each mark once the sentence
before it has played. Pause or stop kills `pw-play` and closes the socket, and the
server abandons the rest of the text. `kokoro-speak` needs no marks, so it sends
everything at once.

The Chrome extension is a `ttsEngine`: Chrome gives it one utterance at a time (Reading
mode sends roughly a sentence each) and waits for its "end" event before the next one. It
passes each one to `kokoro-chrome-host` over native messaging, which Chrome starts on
first use and keeps running while the port is open (the extension lets it go after five
idle minutes). The host makes one server request per utterance and plays it with one
`pw-play`. Pause kills `pw-play` but keeps the audio; resume plays it again from the
last gap in the speech before the point where it stopped, so it doesn't restart mid-word.
Reading mode doesn't use that resume: since the extension reports a word boundary, it
re-speaks the current sentence instead (see Lessons learned).

## Fedora Silverblue (the original setup)

Collected on 2026-09-24 on Fedora Silverblue 44 (GNOME, Wayland, Orca 50.2, Speech
Dispatcher 0.12.1, Chrome 154). There, Kokoro was the system voice through Speech
Dispatcher for Orca, `spd-say` and Chrome's Reading mode, with working pause, resume
and stop. The Fedora-specific files live in `fedora/`. The shared files were moved:
`kokoro-server/` became `server/`, and `speech-dispatcher/sd_kokoro` became
`speechd/sd_kokoro`.

The socket moved from `$XDG_RUNTIME_DIR/kokoro-tts.sock` to
`$XDG_RUNTIME_DIR/kokoro-tts/kokoro-tts.sock`. When you update a Fedora install from here,
update both `server.py` and `sd_kokoro` together (or set `KOKORO_SOCKET`).

| Here | Installed at | What it is |
|---|---|---|
| `server/server.py`, `server/say.py` | `~/kokoro/` | Server and voice comparison script, run inside the `kokoro` distrobox. |
| `fedora/systemd/kokoro-tts.service` | `~/.config/systemd/user/` | Starts the server at login through `distrobox enter -T kokoro`. |
| `speechd/sd_kokoro` | `~/.local/libexec/speech-dispatcher-modules/sd_kokoro` | **Current** Speech Dispatcher module (uses host `/usr/bin/python3`). |
| `fedora/speech-dispatcher/speechd.conf` (+ `.diff` against `/etc`) | `~/.config/speech-dispatcher/speechd.conf` | Loads only `kokoro` (`sd_kokoro`), `DefaultModule kokoro`. espeak-ng commented out. |
| `fedora/speech-dispatcher/modules/kokoro-generic.conf` | `~/.config/speech-dispatcher/modules/kokoro.conf` | **Old** `sd_generic` config, used only if you switch back to the commented `sd_generic` line. |
| `fedora/bin/kokoro-say` | `~/.local/bin/kokoro-say` | Host client for the old `sd_generic` path (rate maps to speed as `2**(rate/100)`). |
| `fedora/chrome/google-chrome.desktop` (+ `.diff`) | `~/.local/share/applications/google-chrome.desktop` | Adds `--enable-speech-dispatcher` to every `Exec=` line. |
| `fedora/orca/orca-settings-current.ini` | dconf `/org/gnome/orca/` | Orca set to `speechdispatcherfactory`, synthesizer `kokoro`. `orca-settings-before.ini` is the state before. |
| `fedora/spiel/libspiel.spec` | `~/rpmbuild/SPECS/` | RPM spec for libspiel 1.0.4 with libspeechprovider 1.0.3 bundled, layered with `rpm-ostree`. |
| `fedora/spiel/original-plan.md` | `~/.claude/plans/` | The original plan for switching Orca to Spiel. |
| `fedora/backups/` | `~/kokoro/*.bak` | Copies taken before each change. |

### Rebuilding on Fedora

1. **Model and server environment** (in a distrobox, so nothing is layered):
   ```bash
   distrobox create -Y -n kokoro -i registry.fedoraproject.org/fedora-toolbox:44
   distrobox enter kokoro -- sudo dnf install -y uv pipewire-utils python3.12
   mkdir -p ~/kokoro && cd ~/kokoro
   curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
   curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
   distrobox enter kokoro -- sh -c 'cd ~/kokoro && uv venv --python /usr/bin/python3.12 .venv && uv pip install --python .venv kokoro-onnx soundfile misaki==0.9.4 num2words spacy phonemizer-fork espeakng-loader https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl'
   cp server/*.py ~/kokoro/
   ```
2. **Service:** copy `fedora/systemd/kokoro-tts.service` to `~/.config/systemd/user/`, then
   run `systemctl --user daemon-reload && systemctl --user enable --now kokoro-tts`.
3. **Speech Dispatcher:** copy `speechd/sd_kokoro` to
   `~/.local/libexec/speech-dispatcher-modules/` (make it executable) and
   `fedora/speech-dispatcher/speechd.conf` to `~/.config/speech-dispatcher/`. Then run
   `killall speech-dispatcher`.
4. **Orca:** `dconf load /org/gnome/orca/ < fedora/orca/orca-settings-current.ini`
5. **Chrome:** add `--enable-speech-dispatcher` to the `Exec=` lines of a user copy of
   `google-chrome.desktop`, then fully restart Chrome (**⋮ → Exit**).
6. Check with `spd-say "hello"`, `spd-say -O`, `spd-say -L -o kokoro`, and
   `journalctl --user -u kokoro-tts -f`.

`bin/kokoro-speak` works on Fedora too. Copy it to `~/.local/bin` and bind it to a GNOME
custom shortcut. Without `wl-paste`, it can only speak text given as an argument or on
stdin.

## Lessons learned

- **A Chrome extension beats Speech Dispatcher for Chrome.** It needs no Chrome flag
  and no `speech-dispatcher` daemon, and avoids that path's problems (see CLAUDE.md: gaps
  between sentences, no audio on a second site until Chrome restarts, stray "espeak"
  words). The catch is loading it unpacked once per profile.
- **Reading mode lists only one non-Google voice per language, as "System voice".**
  Its `getFilteredVoiceList` drops remote voices when any local one exists, keeps every
  voice with "Google" in its name, and of the rest keeps just the default (or first)
  voice per `lang`, shown as "System voice". Chrome's built-in engine registers local
  "Chrome OS US English 1–8" / "Chrome OS UK English …" voices once natural voices are
  downloaded, and as a component it's listed first, so Kokoro never got the slot. Hence
  "(not Google)" in the voice names: it puts them on the Google side of that filter.
  (Seen in Chrome 156 and Chromium 155; it has been like this for many releases.)
- **Reading mode resumes differently without word boundaries.** After a pause, if the
  voice has sent any `word` boundary it re-speaks from the last one; if not, it calls
  `speechSynthesis.resume()`. That hangs (play spins forever, until you skip a sentence)
  when the paused utterance was cancelled in between, for example by previewing or
  choosing a voice. The extension therefore reports the whole utterance as one `word`
  right after `start`, so resuming replays the current sentence.
- **`ttsEngine` voices can't declare `pause` or `resume` events.** Chrome rejects the
  manifest ("Invalid value for 'tts_engine.voices[*].event_types'"); only `start`, `end`,
  `error` and the like. Chrome tracks pause itself and calls `onPause`/`onResume`.
- **Native messaging hosts are per user data dir on Linux**
  (`<user data dir>/NativeMessagingHosts/`), so a throwaway `--user-data-dir` needs its own
  copy of the manifest.
- **Chromium 155 ignores `--load-extension`.** For tests, start it with
  `--remote-debugging-pipe --enable-unsafe-extension-debugging` and call the CDP method
  `Extensions.loadUnpacked`. `speechSynthesis.speak()` from CDP also needs
  `userGesture: true`, or it fails with `not-allowed`. Branded Chrome 156 works the same
  way. Reusing a test profile can keep the extension's old service worker code after its
  files change, so use a fresh `--user-data-dir`. `speechSynthesis.getVoices()` is empty
  until `voiceschanged` fires.
- **Chrome on Linux ignores system TTS without `--enable-speech-dispatcher`.** Without it,
  Reading mode's "system" voice is Chrome's built-in `WasmTtsEngine`.
- **Chrome picks its own voice every time.** Speech Dispatcher's `DefaultModule` is
  ignored. Chrome enumerates every module's voices and scores them by language; ties go to
  the first listed. So: load only the kokoro module, list Heart first, and give each voice
  name exactly **one** language. Chrome keys voices by name + module, so Heart listed
  under en/en-US/en-GB showed up as a British voice.
- **A self-playing module must decline server audio.** Speech Dispatcher first offers
  `audio_output_method=server`. Accepting it while playing audio yourself makes the server
  turn `704 PAUSE` into END for clients. `sd_kokoro` replies `303` to that offer.
- **`sd_generic` can't pause mid-utterance.** It only stops at the end of a chunk. If a
  pause lands on the last chunk, the utterance ends, Chrome gets END, and its
  `Resume()` bails out (`if (!paused_ || !is_speaking_) return;`), so Reading mode hangs.
  Hence `sd_kokoro`.
- **`sd_generic` gotchas:** `$RATE` is `rate * GenericRateMultiply / 100` rounded to an
  integer (use `GenericRateMultiply 100` to get -100..100). For a repeated language+voice
  type, the **last** `AddVoice` line wins.
- **Speech Dispatcher 0.12 user module dir** is `~/.local/libexec/speech-dispatcher-modules`
  (computed as `$XDG_DATA_HOME/../libexec/...`), which works on read-only `/usr`.
- **Dots inside tokens can become sentence ends.** The old kokoro-onnx/espeak-ng phonemization
  path kept punctuation. A decimal followed by more punctuation (`"Opus 5.5."`) came out as
  `fˈaɪv. fˈaɪv` ("five. five"), and `example.com` got a `.` inside it that kokoro-onnx paused
  on. `server.py` still spells these out before Misaki phonemizes the text. (kokoro-onnx 0.6.1;
  `"Opus 5.5"` with nothing after it was already fine there. phonemizer 3.6 reads `"Opus 5.5."`
  correctly by itself, but `example.com` still gets the `.`, so the spelling-out stays.)
- **onnxruntime phones home.** Its pip builds (CPU and GPU, seen in 1.30 and 1.31) include
  Microsoft's 1DS telemetry, which queues events in
  `~/.cache/Microsoft/DeveloperTools/.onnxruntime/` and uploads them to
  `mobile.events.data.microsoft.com` about 9 s after startup. The events hold a persistent
  device ID, kernel version, CPU model, RAM, the Python executable path, which providers
  ran, run counts and timings, and error messages (no text, voices or model names).
  `ORT_DISABLE_TELEMETRY=1` stops both the queueing and the upload; `server.py`, `say.py`
  and the installer's CUDA check set it before onnxruntime loads.
- **onnxruntime-gpu needs two nudges.** The CUDA libraries from the `nvidia-*` wheels
  are only found after `onnxruntime.preload_dlls()`, and kokoro-onnx, given
  onnxruntime-gpu, tries every provider the build has, starting with TensorRT (not
  installed, so it logs an error and falls back). `server.py` preloads and sets
  `ONNX_PROVIDER=CUDAExecutionProvider` itself when CUDA is available.
- **Spiel doesn't reach Chrome** (Fedora). Orca 50 supports Spiel (it needs libspiel's
  `Spiel-1.0.typelib`, which Fedora doesn't package, hence `fedora/spiel/`). Chrome and most
  apps use Speech Dispatcher instead. Piper through Spiel (`en_GB-cori-high`) was a step on
  the way; Kokoro sounded clearly better.
- **Orca's saved settings can override the default** (Fedora). A named synthesizer (e.g.
  `espeak-ng`) makes Orca pin that module. Mixed settings (`speech-server-factory='spiel'`
  plus `synthesizer='espeak-ng'`) caused random voice switching.
- **Host `python3` was Homebrew's** on the Fedora box. Use `/usr/bin/python3` there for
  GObject bindings (`gi`) and the `speechd` module.

## Not done / ideas

- **Edge TTS** (cloud Microsoft neural voices through the unofficial `edge-tts`) was
  considered but not tried.
- A Spiel provider for Kokoro could be written with libspeechprovider.
- Pause/resume for `kokoro-speak`: stopping `pw-play` with SIGSTOP isn't reliable with
  PipeWire, so it only has stop.
