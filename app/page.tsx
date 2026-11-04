"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Page = { tamil: string; english: string; note: string; image: string };

type Language = { code: string; name: string; speech: string };

const LANGUAGES: Language[] = [
  { code: "ta", name: "Tamil", speech: "ta" },
  { code: "en", name: "English", speech: "en" },
  { code: "hi", name: "Hindi", speech: "hi" },
  { code: "te", name: "Telugu", speech: "te" },
  { code: "ml", name: "Malayalam", speech: "ml" },
  { code: "kn", name: "Kannada", speech: "kn" },
  { code: "bn", name: "Bengali", speech: "bn" },
  { code: "pa", name: "Punjabi", speech: "pa" },
  { code: "mr", name: "Marathi", speech: "mr" },
  { code: "gu", name: "Gujarati", speech: "gu" },
  { code: "es", name: "Spanish", speech: "es" },
  { code: "fr", name: "French", speech: "fr" },
  { code: "de", name: "German", speech: "de" },
  { code: "it", name: "Italian", speech: "it" },
  { code: "pt", name: "Portuguese", speech: "pt" },
  { code: "ru", name: "Russian", speech: "ru" },
  { code: "ar", name: "Arabic", speech: "ar" },
  { code: "zh", name: "Chinese (Mandarin)", speech: "zh" },
  { code: "ja", name: "Japanese", speech: "ja" },
  { code: "ko", name: "Korean", speech: "ko" },
];

const langName = (code: string) =>
  (LANGUAGES.find((l) => l.code === code) || { name: code }).name;
const langSpeech = (code: string) =>
  (LANGUAGES.find((l) => l.code === code) || { speech: "en" }).speech;

// Minimal typing for the browser SpeechRecognition API (Chrome/Edge, and
// Safari where supported). Feature-detected at runtime; absence only
// disables live transcription, never recording.
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const recognitionLang = (code: string) =>
  code === "ta" ? "ta-IN" : code === "en" ? "en-US" : code;

// Rule-based page split (no key needed): two sentences per page, max 8 pages.
function splitPages(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?।。！？])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Fall back to line breaks if there are no sentence endings (common in Tamil text).
  const units =
    sentences.length > 1
      ? sentences
      : text
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < units.length; i += 2) {
    out.push(units.slice(i, i + 2).join(" "));
  }
  return out.slice(0, 8);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

// AI translation + idiom notes (Muse Spark, only with a key). The call
// goes through this app's own /api/translate route so a browser block on
// the Meta API can never silently empty the English side; the route
// returns the Meta error text, which Make my book shows in the status.
async function aiTranslate(
  key: string,
  inputPages: string[],
  inputName: string,
  outputName: string,
): Promise<{ english: string; note: string }[]> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key,
      pages: inputPages,
      inputName,
      outputName,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    pages?: { english: string; note: string }[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      data.error || "Translation request failed (" + res.status + ")",
    );
  }
  return data.pages || [];
}

// AI illustration (Muse Image, only with a key), via this app's own
// /api/illustrate route for the same reason as translation.
async function aiIllustrate(
  key: string,
  pageText: string,
  speaker: string,
): Promise<string> {
  const res = await fetch("/api/illustrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, pageText, speaker }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    image?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      data.error || "Illustration request failed (" + res.status + ")",
    );
  }
  if (!data.image) throw new Error("No illustration returned");
  return data.image;
}

export default function Home() {
  const [speaker, setSpeaker] = useState("");
  const [inputLang, setInputLang] = useState("ta");
  const [outputLang, setOutputLang] = useState("en");
  const [story, setStory] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");
  const [pages, setPages] = useState<Page[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [bookVisible, setBookVisible] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordNote, setRecordNote] = useState(
    "Recording stays on this device. In a supported browser (Chrome or Edge), what you say is also transcribed live into the story box in the chosen input language — press Make my book to translate it. Otherwise, type what was said.",
  );
  const [saveNote, setSaveNote] = useState("");
  const [busy, setBusy] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef("");
  const pagesRef = useRef<Page[]>([]);
  pagesRef.current = pages;

  // Restore a saved book, if any.
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("roots-book") || "null",
      ) as {
        speaker?: string;
        inputLang?: string;
        outputLang?: string;
        pages?: Page[];
      } | null;
      if (saved && saved.pages && saved.pages.length) {
        setPages(saved.pages);
        setPageIndex(0);
        setSpeaker(saved.speaker || "");
        if (saved.inputLang) setInputLang(saved.inputLang);
        if (saved.outputLang) setOutputLang(saved.outputLang);
        setBookVisible(true);
      }
    } catch {
      // no saved book
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setRecordNote(
        "Microphone is not available in this browser. Use a recent Chrome, Edge, or Safari on localhost.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;
      chunksRef.current = [];
      // Pick a recording format this browser can actually play back:
      // Chrome records webm, Safari records mp4. Labelling an mp4 blob
      // as webm (the old code) plays nothing on Safari.
      const mimeType =
        ["audio/webm", "audio/mp4"].find(
          (t) =>
            typeof MediaRecorder !== "undefined" &&
            MediaRecorder.isTypeSupported(t),
        ) || "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setRecordingUrl(URL.createObjectURL(blob));
        setRecordNote(
          "Recording saved in this tab only. Play it back above." +
            (transcriptRef.current
              ? " What you said was transcribed into the story box — press Make my book to translate it into " +
                langName(outputLang) +
                "."
              : " Type what was said into the story box."),
        );
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      // Live transcription (no key needed): what is said appears in the
      // story box as it is spoken, in the chosen input language.
      transcriptRef.current = "";
      const w = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionInstance;
        webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
      };
      const SpeechRecognitionCtor =
        w.SpeechRecognition ?? w.webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        const base = story.trim();
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = recognitionLang(inputLang);
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          let spoken = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            spoken += event.results[i][0].transcript;
          }
          transcriptRef.current = spoken;
          setStory(base + (base && spoken ? " " : "") + spoken);
        };
        recognition.onerror = (event) => {
          setRecordNote(
            (prev) =>
              prev +
              " Live transcription stopped (" +
              event.error +
              ") — the recording still plays back; type the rest.",
          );
        };
        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          recognitionRef.current = null;
        }
      } else {
        setRecordNote(
          "Recording started. This browser does not do live transcription, so type what was said into the story box.",
        );
      }
    } catch (e) {
      const errName = (e as { name?: string })?.name ?? "";
      const errMessage = e instanceof Error ? e.message : String(e);
      let reason = errMessage;
      if (errName === "NotAllowedError") {
        reason =
          "Microphone permission denied — allow the mic for localhost in the browser's site settings (and on a Mac, System Settings → Privacy & Security → Microphone for that browser), then try again.";
      } else if (errName === "NotFoundError") {
        reason = "No microphone found on this device.";
      } else if (errName === "NotReadableError") {
        reason =
          "Microphone is already in use by another app — close it and try again.";
      } else if (errName === "SecurityError") {
        reason =
          "Microphone is blocked on this page — open the app on localhost or https.";
      }
      setRecordNote(
        "Could not start recording: " +
          reason +
          " You can still type the story.",
      );
    }
  }, [story, inputLang, outputLang]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // already stopped
      }
      recognitionRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  const speak = useCallback((text: string, langPrefix: string) => {
    if (!("speechSynthesis" in window)) {
      alert("Speech is not supported in this browser.");
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = speechSynthesis
      .getVoices()
      .find(
        (v) => v.lang && v.lang.toLowerCase().startsWith(langPrefix),
      );
    if (voice) u.voice = voice;
    u.lang = voice
      ? voice.lang
      : langPrefix === "ta"
        ? "ta-IN"
        : "en-US";
    speechSynthesis.speak(u);
  }, []);

  const makeBook = useCallback(async () => {
    const trimmed = story.trim();
    if (!trimmed) {
      setStatus("Type or paste a story first.");
      return;
    }
    const inputPages = splitPages(trimmed);
    const fresh: Page[] = inputPages.map((t) => ({
      tamil: t,
      english: "",
      note: "",
      image: "",
    }));
    setPages(fresh);
    setPageIndex(0);
    setBookVisible(true);
    setBusy(true);
    setStatus(
      "Book made: " +
        fresh.length +
        " page(s)." +
        (apiKey.trim()
          ? " Translating and illustrating…"
          : " No model key — fill in the " +
            langName(outputLang) +
            " side yourself, or add a key for AI translation and illustrations."),
    );
    const key = apiKey.trim();
    if (key) {
      try {
        const translated = await aiTranslate(
          key,
          inputPages,
          langName(inputLang),
          langName(outputLang),
        );
        setPages((prev) =>
          prev.map((p, i) => ({
            ...p,
            english: translated[i]?.english || "",
            note: translated[i]?.note || "",
          })),
        );
        setStatus((s) => s + " Translation done.");
        // Illustrate pages one by one, in the background, so a failure on
        // one page never blocks the book.
        for (let i = 0; i < inputPages.length; i++) {
          try {
            const image = await aiIllustrate(key, inputPages[i], speaker.trim());
            setPages((prev) =>
              prev.map((p, j) => (j === i ? { ...p, image } : p)),
            );
          } catch {
            // leave the placeholder for this page
          }
        }
        setStatus((s) => s + " Illustrations done where they succeeded.");
      } catch (e) {
        setStatus(
          (s) =>
            s +
            " AI translation failed (" +
            (e instanceof Error ? e.message : String(e)) +
            ") — the " +
            langName(outputLang) +
            " side stays editable.",
        );
      }
    }
    setBusy(false);
  }, [story, apiKey, inputLang, outputLang, speaker]);

  const loadExample = useCallback(() => {
    setInputLang("ta");
    setOutputLang("en");
    setSpeaker("Paati");
    setStory(
      "ஒரு காலத்தில், ஒரு சிறிய கிராமத்தில் பாட்டி வாழ்ந்தார்.\n" +
        "பாட்டி தன் பேரனை மிகவும் நேசித்தார்.\n" +
        "பேரன் விழுந்து காயம் அடைந்தபோது, பாட்டி அவனை அணைத்து, 'பரவாயில்லை, கவலைப்படாதே' என்றார்.",
    );
    setStatus(
      "Fictional example loaded in Tamil → English (not a real family story). Press “Make my book”, then edit the English side — or add a model key for AI translation.",
    );
  }, []);

  const saveBook = useCallback(() => {
    try {
      localStorage.setItem(
        "roots-book",
        JSON.stringify({ speaker, inputLang, outputLang, pages }),
      );
      setSaveNote("Book saved in this browser.");
    } catch (e) {
      setSaveNote(
        "Could not save in this browser: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }, [speaker, inputLang, outputLang, pages]);

  const exportBook = useCallback(() => {
    const name = speaker || "Paati";
    const body = pages
      .map(
        (p, i) =>
          `<section><h2>Page ${i + 1}</h2><p>${escapeHtml(p.tamil)}</p><p>${escapeHtml(p.english || "")}</p>${p.note ? `<p><em>${escapeHtml(p.note)}</em></p>` : ""}</section>`,
      )
      .join("\n");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Roots — a story from ${escapeHtml(name)}</title></head><body><h1>A story from ${escapeHtml(name)}</h1>${body}</body></html>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = "roots-book.html";
    a.click();
  }, [pages, speaker]);

  const page = pages[pageIndex];

  return (
    <>
      <style>{`
  :root{--blue:#4a6cf7;--red:#e8332a;--yellow:#f2c94c;--gray:#3d3d3d;--line:#ddd;--bg:#fffdf5}
  .roots-wrap{font-family:system-ui,-apple-system,sans-serif;margin:0;background:var(--bg);color:var(--gray);line-height:1.5}
  .roots-wrap textarea,.roots-wrap input[type=text],.roots-wrap input[type=password]{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:16px}
  .roots-wrap textarea{min-height:160px}
  .roots-wrap select{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:16px;min-height:44px}
  .roots-wrap button{background:var(--blue);color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:16px;min-height:44px;cursor:pointer}
  .roots-wrap button.secondary{background:#fff;color:var(--gray);border:1px solid var(--line)}
  .roots-wrap button:disabled{opacity:.5}
  .brandbar{height:10px;background:linear-gradient(90deg,var(--blue) 0 33%,var(--red) 33% 66%,var(--yellow) 66% 100%)}
  .roots-main{max-width:860px;margin:0 auto;padding:20px}
  .roots-main h1{color:var(--gray)} .roots-main h2{margin-top:32px}
  .card{border:1px solid var(--line);border-radius:14px;padding:18px;background:#fff;margin:16px 0}
  .page{border:1px solid var(--line);border-radius:14px;padding:20px;background:#fff}
  .tamil{font-size:22px;line-height:1.7}
  .english{font-size:18px}
  .note{font-size:14px;color:#666}
  .illustration{min-height:180px;border-radius:12px;background:linear-gradient(135deg,#dbe4ff,#ffe9a8);display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;margin-bottom:16px}
  .illustration img{max-width:100%;border-radius:12px}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .row>*{flex:1} .row button{flex:0 0 auto}
  @media(max-width:700px){.roots-main{padding:12px} .tamil{font-size:20px}}
      `}</style>
      <div className="roots-wrap">
        <div className="brandbar" aria-hidden="true"></div>
        <main className="roots-main">
          <h1>Roots</h1>
          <p>
            <strong>Grandparent stories, in both languages.</strong> A
            grandparent speaks or writes in their own language, and their
            grandchild gets a storybook they can actually understand — the
            original and the translation side by side, with the care and the
            idioms explained, not just translated word for word.
          </p>
          <p className="note">
            Everything you type or record stays in this browser unless you add
            a model key below. Nothing is uploaded to a server by this page on
            its own.
          </p>

          <h2>1. The story or message</h2>
          <div className="card">
            <label>
              <strong>Who is speaking? (optional)</strong>
              <br />
              <input
                type="text"
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
                placeholder="e.g. Paati"
              />
            </label>
            <div className="row" style={{ marginTop: 12 }}>
              <label>
                <strong>Input language</strong>
                <br />
                <select
                  value={inputLang}
                  onChange={(e) => setInputLang(e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <strong>Output language</strong>
                <br />
                <select
                  value={outputLang}
                  onChange={(e) => setOutputLang(e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              <label>
                <strong>
                  Story or message in {langName(inputLang)}
                </strong>{" "}
                — type it, or record it and type what was said
              </label>
              <textarea
                value={story}
                onChange={(e) => setStory(e.target.value)}
                placeholder={`Type the story or message here in ${langName(inputLang)}…`}
              />
            </p>
            <div className="row">
              <button
                className="secondary"
                onClick={startRecording}
                disabled={recording}
              >
                ● Record voice
              </button>
              <button
                className="secondary"
                onClick={stopRecording}
                disabled={!recording}
              >
                ■ Stop
              </button>
              {recordingUrl && (
                <audio controls src={recordingUrl} style={{ flex: 1 }} />
              )}
            </div>
            <p className="note">{recordNote}</p>
            <p>
              <label>
                <strong>
                  Meta Model API key (optional, kept in this tab only)
                </strong>
                <br />
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="MODEL_API_KEY — enables AI translation, idiom notes, and illustrations"
                />
              </label>
            </p>
            <p className="note">
              With a key, Muse Spark translates with cultural context and
              explains idioms, and Muse Image illustrates each page. Without a
              key, the output-language side stays editable for you to fill in,
              and illustrations show a placeholder — the book still works.
            </p>
            <div className="row">
              <button onClick={makeBook} disabled={busy}>
                Make my book
              </button>
              <button className="secondary" onClick={loadExample}>
                Load a fictional example
              </button>
            </div>
            <p className="note">{status}</p>
          </div>

          {bookVisible && page && (
            <div>
              <h2>2. Your book</h2>
              <div className="page">
                <div className="illustration">
                  {page.image ? (
                    <img src={page.image} alt="Storybook illustration" />
                  ) : (
                    <span>
                      Illustration appears here with a model key — otherwise
                      this is a placeholder page.
                    </span>
                  )}
                </div>
                <p className="tamil">{page.tamil}</p>
                <p>
                  <button
                    className="secondary"
                    onClick={() => speak(page.tamil, langSpeech(inputLang))}
                  >
                    🔊 Hear in {langName(inputLang)}
                  </button>
                </p>
                <label>
                  <strong>{langName(outputLang)}</strong> — edit freely
                </label>
                <textarea
                  className="english"
                  style={{ minHeight: 90 }}
                  value={page.english}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPages((prev) =>
                      prev.map((p, j) =>
                        j === pageIndex ? { ...p, english: value } : p,
                      ),
                    );
                  }}
                />
                <p>
                  <button
                    className="secondary"
                    onClick={() =>
                      speak(page.english, langSpeech(outputLang))
                    }
                  >
                    🔊 Hear in {langName(outputLang)}
                  </button>
                </p>
                <p className="note">{page.note}</p>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="secondary"
                  onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  disabled={pageIndex === 0}
                >
                  ← Previous page
                </button>
                <span style={{ textAlign: "center" }}>
                  Page {pageIndex + 1} of {pages.length}
                </span>
                <button
                  className="secondary"
                  onClick={() =>
                    setPageIndex((i) => Math.min(pages.length - 1, i + 1))
                  }
                  disabled={pageIndex === pages.length - 1}
                >
                  Next page →
                </button>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button onClick={exportBook}>
                  Download book as a file
                </button>
                <button className="secondary" onClick={saveBook}>
                  Save book in this browser
                </button>
              </div>
              <p className="note">{saveNote}</p>
            </div>
          )}

          <p className="note" style={{ marginTop: 32 }}>
            Roots is a family storybook, not a medical, legal, or professional
            translation service. Check any translation that matters before
            relying on it. A demo example in this app is fictional — never put
            a real child&apos;s private story or photo into a public
            submission.
          </p>
        </main>
      </div>
    </>
  );
}
