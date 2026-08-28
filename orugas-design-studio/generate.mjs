#!/usr/bin/env node
// Orugas Design Studio — CLI image generator
// Mirrors src/services/gemini.ts from Oruga420/Orugas_Design_Studio
//
// Usage:
//   node generate.mjs --prompt "a red caterpillar" [options]
//
// Options:
//   --prompt <text>            (required) Image prompt
//   --model <name>             gemini-3.1-flash-image-preview (default) |
//                              gemini-3-pro-image-preview |
//                              imagen-4.0-generate-001 (batch-only)
//   --aspect <ratio>           1:1 (default), 16:9, 9:16, 4:3, 3:4, 2:3, 3:2,
//                              4:5, 5:4, 21:9, 1:4, 1:8, 4:1, 8:1
//   --size <res>               512 | 1K (default) | 2K | 4K
//   --count <n>                Number of images (default 1)
//   --mode <normal|batch>      Generation mode (batch only valid for imagen-*)
//   --out <dir>                Output directory (default ./out)
//   --ref <path>               Reference image (repeat flag up to 14x)
//   --base <path>              Base image to edit (enables edit mode)
//   --search                   Enable Google Search grounding
//   --image-search             Enable Google Image Search (requires --search)
//   --thinking <Minimal|High>  Thinking level (default Minimal)
//   --include-thoughts         Capture thought images
//   --camera <text>            Advanced: camera
//   --angle <text>             Advanced: angle
//   --lighting <text>          Advanced: lighting
//   --filter <text>            Advanced: filter
//   --style <text>             Advanced: style
//   --rewrite-json             Rewrite the prompt as structured JSON first
//   --suggest <field>          Auto-suggest a value for advanced field
//                              (camera|angle|lighting|filter|style)
//
// Env:
//   GEMINI_API_KEY  (or API_KEY)
//
// Install once:
//   npm i -g @google/genai   # or run `npm i @google/genai` in this folder

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,   threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

function parseArgs(argv) {
  const o = {
    prompt: "",
    model: "gemini-3.1-flash-image-preview",
    aspect: "1:1",
    size: "1K",
    count: 1,
    mode: "normal",
    out: "./out",
    refs: [],
    base: null,
    search: false,
    imageSearch: false,
    thinking: "Minimal",
    includeThoughts: false,
    advanced: {},
    rewriteJson: false,
    suggest: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--prompt": o.prompt = next(); break;
      case "--model": o.model = next(); break;
      case "--aspect": o.aspect = next(); break;
      case "--size": o.size = next(); break;
      case "--count": o.count = parseInt(next(), 10); break;
      case "--mode": o.mode = next(); break;
      case "--out": o.out = next(); break;
      case "--ref": o.refs.push(next()); break;
      case "--base": o.base = next(); break;
      case "--search": o.search = true; break;
      case "--image-search": o.imageSearch = true; break;
      case "--thinking": o.thinking = next(); break;
      case "--include-thoughts": o.includeThoughts = true; break;
      case "--camera": o.advanced.camera = next(); break;
      case "--angle": o.advanced.angle = next(); break;
      case "--lighting": o.advanced.lighting = next(); break;
      case "--filter": o.advanced.filter = next(); break;
      case "--style": o.advanced.style = next(); break;
      case "--rewrite-json": o.rewriteJson = true; break;
      case "--suggest": o.suggest = next(); break;
      default:
        console.error(`Unknown flag: ${a}`);
        process.exit(2);
    }
  }
  if (!o.prompt) { console.error("--prompt is required"); process.exit(2); }
  return o;
}

function readAsInlineData(p) {
  const buf = fs.readFileSync(p);
  const ext = path.extname(p).slice(1).toLowerCase() || "png";
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return { inlineData: { mimeType: mime, data: buf.toString("base64") } };
}

async function rewritePromptAsJson(ai, prompt) {
  const res = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents:
      "Rewrite the following image generation prompt into a structured JSON " +
      "format that describes the scene, subject, style, and technical details. " +
      "Return ONLY the JSON string.\n\nPrompt: " + prompt,
    config: { safetySettings },
  });
  return res.text || prompt;
}

async function suggestAdvanced(ai, field, prompt, others) {
  const ctx = Object.entries(others)
    .filter(([k, v]) => k !== field && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  const p =
    `You are an expert image generation prompt engineer.\n` +
    `Based on the main prompt: "${prompt}"\n` +
    `And the current technical settings: ${ctx || "None"}\n` +
    `Suggest a highly creative and effective value for the "${field}" field.\n` +
    `Return ONLY the suggested value (a few words), no extra text, no quotes.`;
  const res = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: p,
    config: { safetySettings },
  });
  return (res.text || "").trim();
}

function buildFinalPrompt(prompt, advanced) {
  const adds = [];
  if (advanced.camera)   adds.push(`Camera: ${advanced.camera}`);
  if (advanced.angle)    adds.push(`Angle: ${advanced.angle}`);
  if (advanced.lighting) adds.push(`Lighting: ${advanced.lighting}`);
  if (advanced.filter)   adds.push(`Filter: ${advanced.filter}`);
  if (advanced.style)    adds.push(`Style: ${advanced.style}`);
  return adds.length
    ? `${prompt}. Technical details: ${adds.join(", ")}.`
    : prompt;
}

async function main() {
  const opt = parseArgs(process.argv);
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) { console.error("Set GEMINI_API_KEY (or API_KEY)"); process.exit(1); }

  const ai = new GoogleGenAI({ apiKey });
  fs.mkdirSync(opt.out, { recursive: true });

  let prompt = opt.prompt;
  if (opt.rewriteJson) {
    prompt = await rewritePromptAsJson(ai, prompt);
    console.error("Rewritten prompt:\n" + prompt + "\n");
  }
  if (opt.suggest) {
    const v = await suggestAdvanced(ai, opt.suggest, prompt, opt.advanced);
    opt.advanced[opt.suggest] = v;
    console.error(`Suggested ${opt.suggest}: ${v}`);
  }

  const finalPrompt = buildFinalPrompt(prompt, opt.advanced);
  const isEdit = !!opt.base;
  const isImagen = opt.model.startsWith("imagen-") && !isEdit;
  const saved = [];

  const savePng = (b64, tag) => {
    const name = `${Date.now()}_${tag}.png`;
    const p = path.join(opt.out, name);
    fs.writeFileSync(p, Buffer.from(b64, "base64"));
    saved.push(p);
    return p;
  };

  if (isImagen && opt.mode === "batch") {
    const res = await ai.models.generateImages({
      model: opt.model,
      prompt: finalPrompt,
      config: {
        numberOfImages: opt.count,
        aspectRatio: opt.aspect,
        outputMimeType: "image/png",
      },
    });
    res.generatedImages.forEach((g, i) => savePng(g.image.imageBytes, `batch_${i}`));
  } else {
    for (let i = 0; i < opt.count; i++) {
      if (isImagen) {
        const res = await ai.models.generateImages({
          model: opt.model,
          prompt: finalPrompt,
          config: {
            numberOfImages: 1,
            aspectRatio: opt.aspect,
            outputMimeType: "image/png",
          },
        });
        res.generatedImages.forEach((g, j) => savePng(g.image.imageBytes, `img_${i}_${j}`));
        continue;
      }

      const config = {
        imageConfig: { aspectRatio: opt.aspect, imageSize: opt.size },
        thinkingConfig: { thinkingLevel: opt.thinking, includeThoughts: opt.includeThoughts },
        safetySettings,
      };
      if (opt.search) {
        config.tools = [{
          googleSearch: opt.imageSearch
            ? { searchTypes: { webSearch: {}, imageSearch: {} } }
            : {},
        }];
      }

      const parts = [];
      if (opt.base) parts.push(readAsInlineData(opt.base));
      parts.push({ text: opt.count > 1 ? `${finalPrompt} (variation ${i + 1})` : finalPrompt });
      for (const r of opt.refs) parts.push(readAsInlineData(r));

      const res = await ai.models.generateContent({
        model: opt.model,
        contents: { parts },
        config,
      });

      for (const part of res.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const tag = part.thought ? `thought_${i}` : `img_${i}`;
          savePng(part.inlineData.data, tag);
        }
      }
    }
  }

  console.log(JSON.stringify({ saved, prompt: finalPrompt }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
