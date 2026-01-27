// scripts/src/build-states-index.js
import fs from "fs/promises";
import path from "path";

const STATES_FILES_DIR = path.join(process.cwd(), "resources", "statesFiles");
const OUT_DIR = path.join(process.cwd(), "public", "ui");
const OUT_FILE = path.join(OUT_DIR, "states-index.json");

// ✅ Este es el folder que ya contiene los estados generados (alaska, puerto-rico, etc.)
const GENERATED_STATES_DIR = path.join(process.cwd(), "scripts", "out");

// Si lo vas a servir desde Netlify, pon el BASE URL público.
const BASE_URL =
    process.env.SITEMAPS_BASE_URL || "https://sitemaps.mydripnurse.com";

function slugifyFolderName(input) {
    return String(input || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // diacríticos
        .toLowerCase()
        .trim()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

async function listGeneratedStateSlugs(dirPath) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return new Set(
            entries
                .filter((e) => e.isDirectory())
                .map((e) => e.name)
                .filter(Boolean)
        );
    } catch (e) {
        // Si scripts/out no existe, no incluimos nada (fail safe)
        console.warn(`⚠️ No pude leer ${dirPath}. Error:`, e.message);
        return new Set();
    }
}

async function main() {
    await fs.mkdir(OUT_DIR, { recursive: true });

    const generatedSlugs = await listGeneratedStateSlugs(GENERATED_STATES_DIR);
    if (generatedSlugs.size === 0) {
        console.warn(
            `⚠️ No hay folders en ${GENERATED_STATES_DIR}. El index saldrá vacío.`
        );
    }

    const files = await fs.readdir(STATES_FILES_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const states = [];
    for (const file of jsonFiles) {
        const full = path.join(STATES_FILES_DIR, file);
        const raw = await fs.readFile(full, "utf8");
        const parsed = JSON.parse(raw);

        const stateName = parsed.stateName || file.replace(".json", "");
        const stateSlug = slugifyFolderName(stateName);

        // ✅ FILTRO CLAVE: solo si existe el folder en scripts/out/<stateSlug>
        if (!generatedSlugs.has(stateSlug)) continue;

        const stateJsonUrl = `${BASE_URL}/resources/statesFiles/${file}`;

        states.push({
            stateName,
            stateSlug,

            // ✅ Para compatibilidad con tu UI (a veces buscas stateFileUrl, a veces stateJsonUrl)
            stateJsonUrl,
            stateFileUrl: stateJsonUrl,
            url: stateJsonUrl,
        });
    }

    states.sort((a, b) => a.stateName.localeCompare(b.stateName));

    const out = {
        generatedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        states,
        // opcional: para debug rápido
        includedOnlyIfFolderExistsIn: "scripts/out/<stateSlug>",
    };

    await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
    console.log("✅ Generated:", OUT_FILE);
    console.log("States included:", states.length);
}

main().catch((e) => {
    console.error("❌ build-states-index failed:", e);
    process.exit(1);
});
