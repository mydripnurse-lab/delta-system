import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(toolDir, "..");
const embedDir = path.join(projectDir, "public", "embeds", "home-snapshot");
const sourcePath = path.join(embedDir, "index.html");
const behaviorPath = path.join(embedDir, "mdn-home-snapshot.js");
const outputPath = path.join(embedDir, "ghl.html");
const publicOrigin = (process.env.MDN_EMBED_ORIGIN || "https://care.mydripnurse.com").replace(/\/$/, "");

const source = await readFile(sourcePath, "utf8");
const behavior = await readFile(behaviorPath, "utf8");

const requiredContent = [
  "data-mdn-home-snapshot",
  "{{custom_values.website_url}}",
  "{{custom_values.business__phone}}",
  "mdn-home-snapshot.js",
];

for (const marker of requiredContent) {
  if (!source.includes(marker)) {
    throw new Error(`Home embed source is missing required marker: ${marker}`);
  }
}

if (!behavior.includes('"@type":"FAQPage"') || !behavior.includes("mdn-home-faq-schema")) {
  throw new Error("Home behavior is missing FAQ schema synchronization");
}

const output = source
  .replace(
    /src="\.\/assets\//g,
    `src="${publicOrigin}/embeds/home-snapshot/assets/`,
  )
  .replace(
    /\.\/assets\//g,
    `${publicOrigin}/embeds/home-snapshot/assets/`,
  )
  .replace(
    /href="\.\/mdn-home-snapshot\.css/g,
    `href="${publicOrigin}/embeds/home-snapshot/mdn-home-snapshot.css`,
  )
  .replace(
    /src="\.\/mdn-home-snapshot\.js/g,
    `src="${publicOrigin}/embeds/home-snapshot/mdn-home-snapshot.js`,
  )
  .replace(
    /src="\.\.\/mdn-seo-head\.js/g,
    `src="${publicOrigin}/embeds/mdn-seo-head.js`,
  )
  .replace(
    /src="\.\.\/mdn-local-faq-engine\.js/g,
    `src="${publicOrigin}/embeds/mdn-local-faq-engine.js`,
  );

if (/(?:src|href)="\.\.?\//.test(output)) {
  throw new Error("Generated GHL Home embed still contains relative asset URLs");
}

await writeFile(outputPath, output, "utf8");
console.log(`Generated SEO-safe GHL Home embed: ${outputPath}`);
