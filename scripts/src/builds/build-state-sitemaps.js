// scripts/src/build-state-folders.js
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESOURCES_DIR = path.join(process.cwd(), "resources", "statesFiles");
const STATES_OUT_DIR = path.join(process.cwd(), "states");

// Host central donde se sirven estos sitemaps
const SITEMAPS_HOST = "https://sitemaps.mydripnurse.com";

/** yyyy-mm-dd (local) */
function todayYMD() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Normaliza acentos/diéresis/ñ:
 * "Añasco" => "anasco"
 * "Mayagüez" => "mayaguez"
 * "Peñuelas" => "penuelas"
 */
function latinToAscii(str) {
    return String(str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function slugify(name) {
    return latinToAscii(name)
        .trim()
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

function renderSitemapIndex({ entries, lastmod }) {
    const parts = [];
    parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    parts.push(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`);
    parts.push("");

    for (const e of entries) {
        if (!e?.loc) continue;
        if (e.comment) parts.push(`  <!-- ${e.comment} -->`);
        parts.push(`  <sitemap>`);
        parts.push(`    <loc>${e.loc}</loc>`);
        parts.push(`    <lastmod>${lastmod}</lastmod>`);
        parts.push(`  </sitemap>`);
        parts.push("");
    }

    parts.push(`</sitemapindex>`);
    parts.push("");
    return parts.join("\n");
}

function extractCounties(stateJson) {
    if (!stateJson) return [];
    if (Array.isArray(stateJson)) return stateJson;

    if (Array.isArray(stateJson.counties)) return stateJson.counties;
    if (Array.isArray(stateJson.items)) return stateJson.items;

    for (const k of Object.keys(stateJson)) {
        if (Array.isArray(stateJson[k])) return stateJson[k];
    }
    return [];
}

function detectStateNameFromJson(stateJson, filenameSlug) {
    return (
        stateJson?.stateName ||
        stateJson?.name ||
        stateJson?.State ||
        (filenameSlug ? filenameSlug.replace(/-/g, " ") : "Unknown")
    );
}

function pickDivisionFolder(stateSlug) {
    if (stateSlug === "louisiana") return "parishes";
    if (stateSlug === "puerto-rico") return "cities";
    return "counties";
}

async function listStateFiles() {
    const files = await fs.readdir(RESOURCES_DIR);
    return files
        .filter((f) => f.toLowerCase().endsWith(".json"))
        .map((f) => ({
            file: f,
            slug: f.replace(/\.json$/i, ""),
            fullPath: path.join(RESOURCES_DIR, f),
        }))
        .sort((a, b) => a.slug.localeCompare(b.slug));
}

async function ensureDir(p) {
    await fs.mkdir(p, { recursive: true });
}

async function writeFileEnsureDir(filePath, content) {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, "utf8");
}

/** Loc builders (host central) */
function locStateDivisionRoot(stateSlug, divisionFolder) {
    return `${SITEMAPS_HOST}/states/${stateSlug}/${divisionFolder}/sitemap.xml`;
}

/**
 * Root level division sitemap entry:
 * - For counties/parishes: /states/<state>/<counties>/<county-slug>/sitemap.xml
 * - For PR cities:        /states/<state>/cities/<city-slug>/sitemap.xml
 */
function locDivisionIndexChild(stateSlug, divisionFolder, divisionSlug) {
    return `${SITEMAPS_HOST}/states/${stateSlug}/${divisionFolder}/${divisionSlug}/sitemap.xml`;
}

/**
 * City inside a county/parish:
 * /states/<state>/<counties>/<county-slug>/<city-slug>/sitemap.xml
 */
function locNestedCity(stateSlug, divisionFolder, countySlug, citySlug) {
    return `${SITEMAPS_HOST}/states/${stateSlug}/${divisionFolder}/${countySlug}/${citySlug}/sitemap.xml`;
}

async function main() {
    const lastmod = todayYMD();

    const stateFiles = await listStateFiles();
    if (!stateFiles.length) {
        console.error("❌ No JSON files found in:", RESOURCES_DIR);
        process.exit(1);
    }

    // Prompt
    const rl = readline.createInterface({ input, output });
    console.log("\nAvailable states (resources/statesFiles):");
    stateFiles.forEach((s, i) => console.log(`  ${i + 1}) ${s.slug}`));

    const answer = (await rl.question("\nType state number OR state slug (e.g. 1 or florida): ")).trim();
    rl.close();

    let chosen = null;
    const asNum = Number(answer);
    if (!Number.isNaN(asNum) && asNum >= 1 && asNum <= stateFiles.length) {
        chosen = stateFiles[asNum - 1];
    } else {
        chosen =
            stateFiles.find((s) => s.slug === answer) ||
            stateFiles.find((s) => s.slug === slugify(answer));
    }

    if (!chosen) {
        console.error("❌ State not found. You typed:", answer);
        process.exit(1);
    }

    const raw = await fs.readFile(chosen.fullPath, "utf8");
    const stateJson = JSON.parse(raw);

    const stateSlug = chosen.slug;
    const stateName = detectStateNameFromJson(stateJson, stateSlug);
    const divisionFolder = pickDivisionFolder(stateSlug);

    const counties = extractCounties(stateJson);

    const outStateDir = path.join(STATES_OUT_DIR, stateSlug);
    const outDivisionRootDir = path.join(outStateDir, divisionFolder);

    console.log("\n===============================================");
    console.log("State:", stateName);
    console.log("State slug:", stateSlug);
    console.log("Input JSON:", chosen.fullPath);
    console.log("Output dir:", outStateDir);
    console.log("Folder type:", divisionFolder);
    console.log("Lastmod:", lastmod);
    console.log("Total county objects:", counties.length);
    console.log("===============================================\n");

    await ensureDir(outStateDir);
    await ensureDir(outDivisionRootDir);

    // 1) STATE sitemap.xml (tu formato)
    const stateSitemapXml = renderSitemapIndex({
        lastmod,
        entries: [
            {
                comment: `${stateName} Main Page`,
                loc: `https://${stateSlug}.mydripnurse.com/sitemap.xml`,
            },
            {
                comment:
                    divisionFolder === "parishes"
                        ? `${stateName} Parishes`
                        : divisionFolder === "cities"
                            ? `${stateName} Cities`
                            : `${stateName} Counties`,
                loc: locStateDivisionRoot(stateSlug, divisionFolder),
            },
        ],
    });

    await writeFileEnsureDir(path.join(outStateDir, "sitemap.xml"), stateSitemapXml);

    /**
     * 2) division root sitemap.xml
     * - PR: lista cities directas
     * - Normal: lista counties/parishes (cada una tiene su propio folder)
     */
    let divisionRootEntries = [];

    if (stateSlug === "puerto-rico" && divisionFolder === "cities") {
        const pr = counties[0];
        const cities = Array.isArray(pr?.cities) ? pr.cities : [];

        divisionRootEntries = cities
            .filter((c) => c?.cityName)
            .map((c) => ({
                loc: locDivisionIndexChild(stateSlug, divisionFolder, slugify(c.cityName)),
            }));
    } else {
        divisionRootEntries = counties
            .filter((c) => c?.countyName)
            .map((c) => ({
                loc: locDivisionIndexChild(stateSlug, divisionFolder, slugify(c.countyName)),
            }));
    }

    const divisionRootXml = renderSitemapIndex({
        lastmod,
        entries: divisionRootEntries,
    });

    await writeFileEnsureDir(path.join(outDivisionRootDir, "sitemap.xml"), divisionRootXml);

    /**
     * 3) Build folders + sitemaps
     *
     * ✅ Normal/Louisiana:
     * states/<state>/<counties|parishes>/<county-slug>/sitemap.xml (index)
     * states/<state>/<counties|parishes>/<county-slug>/<city-slug>/sitemap.xml (index)
     *
     * ✅ Puerto Rico:
     * states/puerto-rico/cities/<city-slug>/sitemap.xml (index)
     */
    let ok = 0;
    let failed = 0;

    // 3A) Puerto Rico direct cities
    if (stateSlug === "puerto-rico" && divisionFolder === "cities") {
        const pr = counties[0];
        const cities = Array.isArray(pr?.cities) ? pr.cities : [];

        for (const city of cities) {
            const cityName = city?.cityName;
            const citySitemapUrl = city?.citySitemap;

            if (!cityName || !citySitemapUrl) continue;

            try {
                const citySlug = slugify(cityName);
                const cityDir = path.join(outDivisionRootDir, citySlug);
                const cityFile = path.join(cityDir, "sitemap.xml");

                const xml = renderSitemapIndex({
                    lastmod,
                    entries: [
                        { comment: `${cityName} Main Sitemap`, loc: String(citySitemapUrl).trim() },
                    ],
                });

                await writeFileEnsureDir(cityFile, xml);
                ok++;
            } catch (e) {
                failed++;
                console.error(`❌ Failed PR city "${cityName}":`, e?.message || e);
            }
        }

        console.log(`\n✅ DONE ${stateSlug} | cities ok:${ok} fail:${failed}\n`);
        return;
    }

    // 3B) Normal/Louisiana: county/parish folders with nested city folders
    for (const c of counties) {
        const countyName = c?.countyName;
        if (!countyName) continue;

        const countySlug = slugify(countyName);
        const countyDir = path.join(outDivisionRootDir, countySlug);
        const countyFile = path.join(countyDir, "sitemap.xml");

        try {
            const countySitemapUrl = String(c?.countySitemap || "").trim();
            const cities = Array.isArray(c?.cities) ? c.cities : [];

            // 1) Crear sitemap.xml de cada city dentro del county folder
            for (const city of cities) {
                const cityName = city?.cityName;
                const citySitemapUrl = city?.citySitemap;

                if (!cityName || !citySitemapUrl) continue;

                const citySlug = slugify(cityName);
                const cityDir = path.join(countyDir, citySlug);
                const cityFile = path.join(cityDir, "sitemap.xml");

                // Hosted city sitemap -> referencia al sitemap real en el subdominio
                const cityHostedXml = renderSitemapIndex({
                    lastmod,
                    entries: [
                        { comment: `${cityName} Main Sitemap`, loc: String(citySitemapUrl).trim() },
                    ],
                });

                await writeFileEnsureDir(cityFile, cityHostedXml);
            }

            // 2) Crear el county sitemap.xml (index) que referencia:
            // - su sitemap real (subdominio)
            // - cada city hosted sitemap bajo el mismo county folder
            const entries = [];

            if (countySitemapUrl) {
                entries.push({
                    comment: `${countyName} Main Sitemap`,
                    loc: countySitemapUrl,
                });
            }

            for (const city of cities) {
                if (!city?.cityName) continue;
                const citySlug = slugify(city.cityName);

                entries.push({
                    comment: `${city.cityName} Hosted Sitemap`,
                    loc: locNestedCity(stateSlug, divisionFolder, countySlug, citySlug),
                });
            }

            const countyHostedXml = renderSitemapIndex({ lastmod, entries });
            await writeFileEnsureDir(countyFile, countyHostedXml);

            ok++;
        } catch (e) {
            failed++;
            console.error(`❌ Failed county/parish "${countyName}":`, e?.message || e);
        }
    }

    console.log(`\n✅ DONE ${stateSlug} | divisions ok:${ok} fail:${failed}\n`);
}

main().catch((e) => {
    console.error("❌ Fatal:", e?.message || e);
    process.exit(1);
});
