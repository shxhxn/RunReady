"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeWorkspace = analyzeWorkspace;
const node_fs_1 = require("node:fs");
const node_net_1 = require("node:net");
const path = __importStar(require("node:path"));
const EXACT_MARKERS = new Set([
    ".runready.json",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "pipfile",
    "setup.py",
    "setup.cfg",
    "environment.yml",
    "environment.yaml",
    "manage.py",
    "cargo.toml",
    "go.mod",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "pubspec.yaml",
    "composer.json",
    "gemfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
    "cmakelists.txt",
    "deno.json",
    "deno.jsonc",
    "makefile",
    "justfile",
    "taskfile.yml",
    "taskfile.yaml",
    "procfile",
    "package.swift",
    "mix.exs",
    "description",
    "app.r",
    "index.html",
]);
const EXCLUDED_DIRECTORIES = new Set([
    ".git",
    ".hg",
    ".svn",
    ".idea",
    ".vscode-test",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".dart_tool",
    ".venv",
    "venv",
    "node_modules",
    "vendor",
    "target",
    "dist",
    "out",
    "coverage",
    "build",
    "__pycache__",
]);
async function pathExists(filePath) {
    try {
        await node_fs_1.promises.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function readText(filePath) {
    try {
        return await node_fs_1.promises.readFile(filePath, "utf8");
    }
    catch {
        return "";
    }
}
async function readJson(filePath) {
    try {
        return JSON.parse(await node_fs_1.promises.readFile(filePath, "utf8"));
    }
    catch {
        return undefined;
    }
}
function dependency(state, summary, setupCommands = [], details = []) {
    return { state, summary, setupCommands, details };
}
function choice(label, command, description, recommended = false, url) {
    return { label, command, description, recommended, ...(url ? { url } : {}) };
}
function candidate(rootDir, markerFile, name, projectType, confidence, evidence, dependencies, runChoices) {
    return {
        id: `${rootDir}:${projectType}:${markerFile}`,
        rootDir,
        markerFile,
        name,
        projectType,
        confidence,
        evidence,
        dependencies,
        runChoices,
    };
}
function isMarker(fileName) {
    const lower = fileName.toLowerCase();
    return (EXACT_MARKERS.has(lower) ||
        /^requirements(?:[-_.][a-z0-9_.-]+)?\.txt$/.test(lower) ||
        lower.endsWith(".csproj") ||
        lower.endsWith(".fsproj"));
}
async function discoverMarkers(rootDir, maxDepth) {
    const found = new Map();
    async function walk(directory, depth) {
        let entries;
        try {
            entries = await node_fs_1.promises.readdir(directory, { withFileTypes: true });
        }
        catch {
            return;
        }
        const markers = entries
            .filter((entry) => entry.isFile() && isMarker(entry.name))
            .map((entry) => entry.name);
        if (markers.length > 0) {
            found.set(directory, new Set(markers));
        }
        if (depth >= maxDepth) {
            return;
        }
        await Promise.all(entries
            .filter((entry) => entry.isDirectory() &&
            !entry.isSymbolicLink() &&
            !EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase()) &&
            !entry.name.startsWith("."))
            .map((entry) => walk(path.join(directory, entry.name), depth + 1)));
    }
    await walk(rootDir, 0);
    return [...found.entries()].map(([directory, files]) => ({ directory, files }));
}
function detectNodeType(pkg) {
    if (pkg.engines?.vscode)
        return "VS Code Extension";
    const allDependencies = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
    };
    if (allDependencies.next)
        return "Next.js";
    if (allDependencies.nuxt)
        return "Nuxt";
    if (allDependencies["@sveltejs/kit"])
        return "SvelteKit";
    if (allDependencies.astro)
        return "Astro";
    if (allDependencies["@angular/core"])
        return "Angular";
    if (allDependencies["react-scripts"])
        return "Create React App";
    if (allDependencies.vite)
        return allDependencies.react ? "React + Vite" : "Vite";
    if (allDependencies.electron)
        return "Electron";
    if (allDependencies.express)
        return "Express";
    return "Node.js";
}
async function detectPackageManager(rootDir, pkg) {
    const declared = pkg.packageManager?.split("@")[0];
    if (declared === "npm" || declared === "pnpm" || declared === "yarn" || declared === "bun") {
        return declared;
    }
    if (await pathExists(path.join(rootDir, "pnpm-lock.yaml")))
        return "pnpm";
    if (await pathExists(path.join(rootDir, "yarn.lock")))
        return "yarn";
    if ((await pathExists(path.join(rootDir, "bun.lock"))) ||
        (await pathExists(path.join(rootDir, "bun.lockb")))) {
        return "bun";
    }
    return "npm";
}
function scriptCommand(manager, script) {
    const safeScript = /^[a-zA-Z0-9:_-]+$/.test(script) ? script : `"${script.replace(/"/g, '\\"')}"`;
    return `${manager} run ${safeScript}`;
}
function installCommand(manager) {
    switch (manager) {
        case "npm":
            return "npm install";
        case "pnpm":
            return "pnpm install";
        case "yarn":
            return "yarn install";
        case "bun":
            return "bun install";
    }
}
function addDependencyCommand(manager, packageNames) {
    const packages = packageNames.join(" ");
    switch (manager) {
        case "npm":
            return `npm install ${packages}`;
        case "pnpm":
            return `pnpm add ${packages}`;
        case "yarn":
            return `yarn add ${packages}`;
        case "bun":
            return `bun add ${packages}`;
    }
}
const COMMON_BUILD_PACKAGES = new Set([
    "tailwindcss",
    "@tailwindcss/postcss",
    "@tailwindcss/vite",
    "postcss",
    "autoprefixer",
    "sass",
    "less",
    "stylus",
]);
function packageNameFromSpecifier(specifier) {
    if (!specifier || specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("#") || specifier.startsWith("@/") || /^[a-z]+:/i.test(specifier))
        return undefined;
    if (specifier.startsWith("@")) {
        const parts = specifier.split("/");
        return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined;
    }
    return specifier.split("/")[0];
}
async function findReferencedBuildPackages(rootDir) {
    const found = new Set();
    const supportedExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".css", ".scss", ".sass", ".less"]);
    let inspected = 0;
    async function walk(directory, depth) {
        if (inspected >= 400 || depth > 8)
            return;
        let entries;
        try {
            entries = await node_fs_1.promises.readdir(directory, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (inspected >= 400)
                return;
            if (entry.isDirectory())
                continue;
            if (!entry.isFile() || !supportedExtensions.has(path.extname(entry.name).toLowerCase()))
                continue;
            const filePath = path.join(directory, entry.name);
            let stat;
            try {
                stat = await node_fs_1.promises.stat(filePath);
            }
            catch {
                continue;
            }
            if (stat.size > 1024 * 1024)
                continue;
            inspected += 1;
            const content = await readText(filePath);
            const patterns = [
                /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/g,
                /@(?:import|plugin)\s+(?:url\()?\s*["']([^"']+)["']/g,
            ];
            for (const pattern of patterns) {
                for (const match of content.matchAll(pattern)) {
                    const packageName = packageNameFromSpecifier(match[1]);
                    if (packageName && COMMON_BUILD_PACKAGES.has(packageName))
                        found.add(packageName);
                }
            }
        }
        await Promise.all(entries
            .filter((entry) => entry.isDirectory() &&
            !entry.isSymbolicLink() &&
            !EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase()) &&
            !entry.name.startsWith("."))
            .map((entry) => walk(path.join(directory, entry.name), depth + 1)));
    }
    await walk(rootDir, 0);
    return [...found].sort();
}
async function findDependencyDirectory(projectRoot, scanRoot, dependencyName) {
    let current = projectRoot;
    const dependencyParts = dependencyName.split("/");
    while (true) {
        if (await pathExists(path.join(current, "node_modules", ...dependencyParts))) {
            return true;
        }
        if (path.resolve(current) === path.resolve(scanRoot))
            return false;
        const parent = path.dirname(current);
        if (parent === current || !path.resolve(parent).startsWith(path.resolve(scanRoot)))
            return false;
        current = parent;
    }
}
async function nodeDependencies(rootDir, scanRoot, pkg, manager) {
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const referencedBuildPackages = await findReferencedBuildPackages(rootDir);
    const undeclaredBuildPackages = referencedBuildPackages.filter((name) => !names.includes(name));
    if ((await pathExists(path.join(rootDir, ".pnp.cjs"))) ||
        (await pathExists(path.join(rootDir, ".pnp.js")))) {
        if (undeclaredBuildPackages.length > 0) {
            return dependency("missing", `${undeclaredBuildPackages.length} referenced build package${undeclaredBuildPackages.length === 1 ? " is" : "s are"} not declared.`, [addDependencyCommand(manager, undeclaredBuildPackages)], [`Add to package.json: ${undeclaredBuildPackages.join(", ")}`]);
        }
        return dependency("ready", "Yarn Plug'n'Play dependency map found.");
    }
    const checks = await Promise.all(names.map(async (name) => ({
        name,
        found: await findDependencyDirectory(rootDir, scanRoot, name),
    })));
    const missing = checks.filter((item) => !item.found).map((item) => item.name);
    const missingUndeclared = [];
    for (const name of undeclaredBuildPackages) {
        if (!(await findDependencyDirectory(rootDir, scanRoot, name)))
            missingUndeclared.push(name);
    }
    if (missing.length === 0 && missingUndeclared.length === 0) {
        if (names.length === 0)
            return dependency("ready", "No npm dependencies are declared or referenced by recognized build configuration.");
        return dependency("ready", `All ${names.length} directly declared dependencies are installed.`, [], ["Checked direct dependencies in node_modules, including hoisted workspace packages."]);
    }
    const setupCommands = [];
    if (missing.length > 0)
        setupCommands.push(installCommand(manager));
    if (missingUndeclared.length > 0)
        setupCommands.push(addDependencyCommand(manager, missingUndeclared));
    const details = [];
    if (missing.length > 0)
        details.push(`Missing declared packages: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ", ..." : ""}`);
    if (missingUndeclared.length > 0)
        details.push(`Referenced by source or build files but absent from package.json and node_modules: ${missingUndeclared.join(", ")}`);
    const missingCount = missing.length + missingUndeclared.length;
    return dependency("missing", `${missingCount} required Node package${missingCount === 1 ? " is" : "s are"} missing.`, setupCommands, details);
}
function nodeRunUrl(projectType, script) {
    const explicitPort = /(?:--port(?:=|\s+)|(?:^|\s)-p\s+|\bPORT\s*=\s*)(\d{2,5})/i.exec(script)?.[1];
    const defaultPorts = {
        "Next.js": 3000,
        "Nuxt": 3000,
        "Create React App": 3000,
        "React + Vite": 5173,
        "Vite": 5173,
        "SvelteKit": 5173,
        "Astro": 4321,
        "Angular": 4200,
    };
    const port = explicitPort ?? defaultPorts[projectType];
    return port ? `http://localhost:${port}` : undefined;
}
function extractNodeEntryFile(script) {
    return /\bnode(?:\.exe)?\s+(?:--[a-zA-Z0-9_-]+(?:=[^\s]+)?\s+)*["']?([^"'\s]+\.(?:js|cjs|mjs))["']?/i.exec(script)?.[1];
}
async function inferNodeServer(rootDir, script) {
    const entryFile = extractNodeEntryFile(script);
    if (!entryFile || !(await pathExists(path.join(rootDir, entryFile))))
        return undefined;
    const content = await readText(path.join(rootDir, entryFile));
    const supportsPortEnvironment = /process\.env(?:\.PORT|\[['"]PORT['"]\])/.test(content);
    const directEnvironmentFallback = /process\.env(?:\.PORT|\[['"]PORT['"]\])[^\r\n;]{0,120}?(?:\|\||\?\?)\s*(\d{2,5})/.exec(content)?.[1];
    const portConstants = [...content.matchAll(/\b(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*PORT[A-Za-z0-9_]*)\s*=\s*(\d{2,5})\b/gi)];
    const referencedConstant = portConstants.find((match) => new RegExp(`(?:listen\\s*\\(\\s*|(?:\\|\\||\\?\\?)\\s*)${match[1]}\\b`).test(content));
    const directListenPort = /\.listen\s*\(\s*(\d{2,5})\b/.exec(content)?.[1];
    const port = Number(directEnvironmentFallback ?? referencedConstant?.[2] ?? directListenPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        return undefined;
    return { port, supportsPortEnvironment, entryFile };
}
async function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = (0, node_net_1.createServer)();
        let settled = false;
        const finish = (available) => {
            if (settled)
                return;
            settled = true;
            resolve(available);
        };
        server.unref();
        server.once("error", () => finish(false));
        server.listen({ port, host: "127.0.0.1", exclusive: true }, () => {
            server.close(() => finish(true));
        });
    });
}
async function findAvailablePort(startPort, attempts = 25) {
    for (let port = startPort; port < startPort + attempts && port <= 65535; port += 1) {
        if (await isPortAvailable(port))
            return port;
    }
    return undefined;
}
async function analyzeNode(rootDir, scanRoot) {
    const packagePath = path.join(rootDir, "package.json");
    const pkg = await readJson(packagePath);
    if (!pkg)
        return undefined;
    const manager = await detectPackageManager(rootDir, pkg);
    const scripts = pkg.scripts ?? {};
    const projectType = detectNodeType(pkg);
    const preferred = ["dev", "start", "serve", "preview", "develop", "watch"];
    const likelyScripts = Object.keys(scripts).filter((name) => preferred.includes(name) || /^(dev|start|serve|preview)(:|$)/.test(name));
    likelyScripts.sort((left, right) => {
        const leftIndex = preferred.indexOf(left);
        const rightIndex = preferred.indexOf(right);
        return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
    });
    const runChoices = [];
    for (const [index, name] of likelyScripts.entries()) {
        const item = choice(`${manager} script: ${name}`, scriptCommand(manager, name), scripts[name], index === 0, nodeRunUrl(projectType, scripts[name]));
        const server = await inferNodeServer(rootDir, scripts[name]);
        if (server) {
            item.url = `http://localhost:${server.port}`;
            if (!(await isPortAvailable(server.port))) {
                if (server.supportsPortEnvironment) {
                    const availablePort = await findAvailablePort(server.port + 1);
                    if (availablePort) {
                        item.environmentVariables = { PORT: String(availablePort) };
                        item.url = `http://localhost:${availablePort}`;
                        item.notice = `Port ${server.port} is already in use, so RunReady selected port ${availablePort}.`;
                    }
                    else {
                        item.notice = `Port ${server.port} is already in use and no nearby free port was found.`;
                        item.blockedReason = item.notice;
                    }
                }
                else {
                    item.notice = `Port ${server.port} is already in use and this entry file does not read the PORT environment variable.`;
                    item.blockedReason = item.notice;
                }
            }
        }
        runChoices.push(item);
    }
    if (pkg.engines?.vscode) {
        runChoices.forEach((item) => {
            item.recommended = false;
        });
        const compileScript = scripts.compile
            ? [scriptCommand(manager, "compile")]
            : scripts.build
                ? [scriptCommand(manager, "build")]
                : [];
        const launch = "code --new-window --extensionDevelopmentPath=.";
        runChoices.unshift({
            label: "Launch Extension Development Host",
            command: launch,
            commandSequence: [...compileScript, launch],
            description: compileScript.length > 0
                ? "Compile the extension, then launch it in a new VS Code window"
                : "Launch the extension in a new VS Code window",
            recommended: true,
        });
    }
    if (runChoices.length === 0 && pkg.main) {
        runChoices.push(choice("Run package entry point", `node "${pkg.main}"`, pkg.main, true));
    }
    if (runChoices.length === 0) {
        for (const entryFile of ["server.js", "app.js", "index.js", "main.js"]) {
            if (await pathExists(path.join(rootDir, entryFile))) {
                runChoices.push(choice(`Run ${entryFile}`, `node "${entryFile}"`, "Common Node.js entry file", true));
                break;
            }
        }
    }
    if (runChoices.length === 0) {
        const otherScripts = Object.keys(scripts).filter((name) => !/^(pre|post)/.test(name) && !["lint", "format", "test", "build"].includes(name));
        otherScripts.slice(0, 8).forEach((name, index) => {
            runChoices.push(choice(`${manager} script: ${name}`, scriptCommand(manager, name), `${scripts[name]} (purpose inferred from package.json only)`, index === 0));
        });
    }
    if (runChoices.length === 0)
        return undefined;
    return candidate(rootDir, packagePath, pkg.name || path.basename(rootDir), projectType, likelyScripts.length > 0 ? "high" : "medium", [
        `Found package.json with ${Object.keys(scripts).length} script(s).`,
        `Selected ${manager} from package metadata or lockfiles.`,
        `Detected ${projectType} from declared packages.`,
    ], await nodeDependencies(rootDir, scanRoot, pkg, manager), runChoices);
}
function pythonExecutable(venvName) {
    if (!venvName)
        return process.platform === "win32" ? "python" : "python3";
    return process.platform === "win32"
        ? `.\\${venvName}\\Scripts\\python.exe`
        : `./${venvName}/bin/python`;
}
function pythonScriptExecutable(venvName, scriptName) {
    return process.platform === "win32"
        ? `.\\${venvName}\\Scripts\\${scriptName}.exe`
        : `./${venvName}/bin/${scriptName}`;
}
function findPyprojectScript(content) {
    const match = /\[(?:project|tool\.poetry)\.scripts\]([\s\S]*?)(?=\n\s*\[|$)/i.exec(content);
    if (!match)
        return undefined;
    return /^\s*([a-zA-Z0-9_.-]+)\s*=/m.exec(match[1])?.[1];
}
async function listRootFiles(rootDir) {
    try {
        return (await node_fs_1.promises.readdir(rootDir, { withFileTypes: true }))
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name);
    }
    catch {
        return [];
    }
}
async function findRequirementFile(rootDir) {
    const files = await listRootFiles(rootDir);
    const requirementFiles = files.filter((file) => /^requirements(?:[-_.][a-z0-9_.-]+)?\.txt$/i.test(file));
    requirementFiles.sort((left, right) => {
        if (left.toLowerCase() === "requirements.txt")
            return -1;
        if (right.toLowerCase() === "requirements.txt")
            return 1;
        return left.localeCompare(right);
    });
    return requirementFiles[0];
}
async function findVirtualEnvironment(rootDir) {
    for (const name of [".venv", "venv", "env"]) {
        const interpreter = process.platform === "win32"
            ? path.join(rootDir, name, "Scripts", "python.exe")
            : path.join(rootDir, name, "bin", "python");
        if ((await pathExists(path.join(rootDir, name, "pyvenv.cfg"))) &&
            (await pathExists(interpreter)))
            return name;
    }
    return undefined;
}
async function findIncompleteVirtualEnvironments(rootDir) {
    const incomplete = [];
    for (const name of [".venv", "venv", "env"]) {
        const environmentRoot = path.join(rootDir, name);
        if (!(await pathExists(environmentRoot)))
            continue;
        const interpreter = process.platform === "win32"
            ? path.join(environmentRoot, "Scripts", "python.exe")
            : path.join(environmentRoot, "bin", "python");
        if (!(await pathExists(path.join(environmentRoot, "pyvenv.cfg"))) ||
            !(await pathExists(interpreter)))
            incomplete.push(name);
    }
    return incomplete;
}
async function discoverPythonFiles(rootDir, maxDepth = 3, limit = 250) {
    const found = [];
    async function walk(directory, depth) {
        if (found.length >= limit)
            return;
        let entries;
        try {
            entries = await node_fs_1.promises.readdir(directory, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (found.length >= limit)
                return;
            if (entry.isFile() && entry.name.toLowerCase().endsWith(".py"))
                found.push(path.relative(rootDir, path.join(directory, entry.name)));
        }
        if (depth >= maxDepth)
            return;
        await Promise.all(entries
            .filter((entry) => entry.isDirectory() &&
            !entry.isSymbolicLink() &&
            !EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase()) &&
            !entry.name.startsWith("."))
            .map((entry) => walk(path.join(directory, entry.name), depth + 1)));
    }
    await walk(rootDir, 0);
    return found;
}
function pythonModule(relativePath) {
    return relativePath.replace(/\.py$/i, "").split(path.sep).join(".").replace(/\.__init__$/i, "");
}
function isIgnoredPythonEntry(relativePath) {
    const name = path.basename(relativePath).toLowerCase();
    return (name === "__init__.py" ||
        name === "conftest.py" ||
        name === "setup.py" ||
        name === "tempcoderunnerfile.py" ||
        name.startsWith("test_") ||
        name.endsWith("_test.py") ||
        relativePath.split(path.sep).some((part) => ["tests", "test", "migrations"].includes(part.toLowerCase())));
}
function addUniqueChoice(choices, item) {
    if (!choices.some((existing) => existing.command === item.command))
        choices.push(item);
}
async function readmePythonChoices(rootDir, python) {
    const readmeName = (await listRootFiles(rootDir)).find((file) => /^readme(?:\.[a-z0-9_-]+)?\.(?:md|txt)$/i.test(file) || /^readme\.(?:md|txt)$/i.test(file));
    if (!readmeName)
        return [];
    const content = await readText(path.join(rootDir, readmeName));
    const snippets = [];
    for (const match of content.matchAll(/`([^`\r\n]+)`/g))
        snippets.push(match[1].trim());
    for (const line of content.split(/\r?\n/)) {
        const clean = line.trim().replace(/^[$>]\s*/, "");
        if (/^(?:python(?:3)?|py|streamlit|uvicorn|flask)\s+/i.test(clean))
            snippets.push(clean);
    }
    const results = [];
    for (const snippet of snippets) {
        const streamlit = /^streamlit\s+run\s+["']?([^"'\s]+\.py)["']?(.*)$/i.exec(snippet);
        if (streamlit && await pathExists(path.join(rootDir, streamlit[1]))) {
            addUniqueChoice(results, choice(`Run ${streamlit[1]} with Streamlit`, `${python} -m streamlit run "${streamlit[1]}"${streamlit[2]}`, `Documented in ${readmeName}`, true, "http://localhost:8501"));
            continue;
        }
        const direct = /^(?:python(?:3)?|py)\s+["']?([^"'\s]+\.py)["']?(.*)$/i.exec(snippet);
        if (direct && await pathExists(path.join(rootDir, direct[1])))
            addUniqueChoice(results, choice(`Run ${direct[1]}`, `${python} "${direct[1]}"${direct[2]}`, `Documented in ${readmeName}`, results.length === 0));
    }
    return results;
}
function parseRequirementNames(content) {
    return content
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+#.*$/, "").trim())
        .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("-"))
        .map((line) => line.split(/[<>=!~;\s]/, 1)[0].split("[", 1)[0])
        .filter((name) => /^[a-zA-Z0-9_.-]+$/.test(name));
}
function normalizePythonPackageName(name) {
    return name.toLowerCase().replace(/[-_.]+/g, "-");
}
async function missingPythonRequirements(rootDir, venvName, requirementsName) {
    const requirementsPath = path.join(rootDir, requirementsName);
    const requirements = parseRequirementNames(await readText(requirementsPath));
    if (requirements.length === 0)
        return [];
    const sitePackages = path.join(rootDir, venvName, "Lib", "site-packages");
    let entries;
    try {
        entries = await node_fs_1.promises.readdir(sitePackages);
    }
    catch {
        return requirements;
    }
    const installed = entries
        .filter((entry) => entry.toLowerCase().endsWith(".dist-info"))
        .map(normalizePythonPackageName);
    return requirements.filter((requirement) => {
        const normalized = normalizePythonPackageName(requirement);
        return !installed.some((entry) => entry.startsWith(`${normalized}-`));
    });
}
async function pythonDependencyReport(rootDir) {
    const venvName = await findVirtualEnvironment(rootDir);
    const incompleteVenvs = await findIncompleteVirtualEnvironments(rootDir);
    const requirementsName = await findRequirementFile(rootDir);
    const pyproject = await pathExists(path.join(rootDir, "pyproject.toml"));
    const setupProject = (await pathExists(path.join(rootDir, "setup.py"))) ||
        (await pathExists(path.join(rootDir, "setup.cfg")));
    const pipfile = await pathExists(path.join(rootDir, "Pipfile"));
    const condaFile = (await pathExists(path.join(rootDir, "environment.yml")))
        ? "environment.yml"
        : (await pathExists(path.join(rootDir, "environment.yaml")))
            ? "environment.yaml"
            : undefined;
    if (!requirementsName && !pyproject && !setupProject && !pipfile && !condaFile) {
        return dependency("ready", "No Python dependency manifest was found.");
    }
    if (venvName) {
        if (requirementsName) {
            const requirementNames = parseRequirementNames(await readText(path.join(rootDir, requirementsName)));
            const missing = await missingPythonRequirements(rootDir, venvName, requirementsName);
            if (missing.length === 0 && requirementNames.length > 0) {
                return dependency("ready", `All ${requirementNames.length} directly declared Python dependencies are installed.`, [], ["Checked installed distribution metadata in the local virtual environment."]);
            }
            if (missing.length > 0) {
                return dependency("missing", `${missing.length} of ${requirementNames.length} directly declared Python dependencies appear to be missing.`, [`${pythonExecutable(venvName)} -m pip install -r "${requirementsName}"`], [`Missing: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ", ..." : ""}`]);
            }
        }
        return dependency("unknown", `Local Python environment '${venvName}' exists, but its complete package set was not proven.`, [
            requirementsName
                ? `${pythonExecutable(venvName)} -m pip install -r "${requirementsName}"`
                : pipfile
                    ? "pipenv install"
                    : condaFile
                        ? `conda env update -f "${condaFile}" --prune`
                        : `${pythonExecutable(venvName)} -m pip install -e .`,
        ], ["The idempotent installer step is included to verify and repair package versions before launch."]);
    }
    if (pipfile) {
        return dependency("missing", "A Pipfile was found, but no local virtual environment was detected.", ["pipenv install"], ["Pipenv manages the environment and locked dependencies."]);
    }
    if (condaFile) {
        return dependency("missing", "A Conda environment file was found, but no local Python environment was detected.", [`conda env create -f "${condaFile}"`], ["RunReady cannot prove whether a matching named Conda environment already exists."]);
    }
    const globalPython = pythonExecutable(undefined);
    const localPython = pythonExecutable(".venv");
    const setupCommands = [`${globalPython} -m venv .venv`];
    if (requirementsName) {
        setupCommands.push(`${localPython} -m pip install -r "${requirementsName}"`);
    }
    else {
        setupCommands.push(`${localPython} -m pip install -e .`);
    }
    return dependency("missing", incompleteVenvs.length > 0
        ? `The local Python environment ${incompleteVenvs.map((name) => `'${name}'`).join(", ")} is incomplete or incompatible with this operating system.`
        : "Python dependencies are declared, but no usable local virtual environment was found.", setupCommands, [incompleteVenvs.length > 0
            ? "The generated setup command repairs or replaces the local .venv before using its interpreter."
            : "RunReady creates .venv and uses its interpreter directly."]);
}
async function analyzePython(rootDir) {
    const managePy = path.join(rootDir, "manage.py");
    const requirementsName = await findRequirementFile(rootDir);
    const requirementsPath = requirementsName ? path.join(rootDir, requirementsName) : "";
    const pyprojectPath = path.join(rootDir, "pyproject.toml");
    const rootFiles = await listRootFiles(rootDir);
    const supportingMarkerName = rootFiles.find((file) => ["pipfile", "setup.py", "setup.cfg", "environment.yml", "environment.yaml"].includes(file.toLowerCase()));
    const markerFile = (await pathExists(managePy))
        ? managePy
        : (await pathExists(pyprojectPath))
            ? pyprojectPath
            : requirementsPath || path.join(rootDir, supportingMarkerName ?? "");
    const hasPythonMarker = (await pathExists(managePy)) ||
        Boolean(requirementsName) ||
        (await pathExists(pyprojectPath)) ||
        (await pathExists(path.join(rootDir, "Pipfile"))) ||
        (await pathExists(path.join(rootDir, "setup.py"))) ||
        (await pathExists(path.join(rootDir, "setup.cfg"))) ||
        (await pathExists(path.join(rootDir, "environment.yml"))) ||
        (await pathExists(path.join(rootDir, "environment.yaml")));
    if (!hasPythonMarker)
        return undefined;
    const venvName = await findVirtualEnvironment(rootDir);
    const dependencyReport = await pythonDependencyReport(rootDir);
    const python = pythonExecutable(venvName ?? (dependencyReport.state === "missing" ? ".venv" : undefined));
    const dependencyFiles = [requirementsPath, pyprojectPath, path.join(rootDir, "Pipfile"), path.join(rootDir, "setup.py"), path.join(rootDir, "setup.cfg"), path.join(rootDir, "environment.yml"), path.join(rootDir, "environment.yaml")].filter(Boolean);
    const dependencyText = (await Promise.all(dependencyFiles.map(readText))).join("\n").toLowerCase();
    const pyprojectText = await readText(pyprojectPath);
    const choices = [];
    let projectType = "Python";
    const evidence = [];
    if (await pathExists(managePy)) {
        projectType = "Django";
        choices.push(choice("Django development server", `${python} manage.py runserver 127.0.0.1:8000`, "manage.py found", true, "http://127.0.0.1:8000"));
        evidence.push("Found manage.py, which is Django's project runner.");
    }
    else {
        const pythonFiles = (await discoverPythonFiles(rootDir)).filter((file) => !isIgnoredPythonEntry(file));
        const inspected = await Promise.all(pythonFiles.map(async (file) => ({ file, content: await readText(path.join(rootDir, file)) })));
        const streamlitApps = inspected.filter(({ file, content }) => dependencyText.includes("streamlit") &&
            (/^\s*(?:import\s+streamlit|from\s+streamlit\s+import)\b/m.test(content) || path.basename(file).toLowerCase() === "dashboard.py"));
        for (const { file } of streamlitApps.slice(0, 6))
            addUniqueChoice(choices, choice(`Run ${file} with Streamlit`, `${python} -m streamlit run "${file}"`, "Streamlit is declared and imported by this file", choices.length === 0, "http://localhost:8501"));
        if (streamlitApps.length > 0) {
            projectType = "Streamlit";
            evidence.push(`Found Streamlit and ${streamlitApps.map((item) => item.file).slice(0, 3).join(", ")}.`);
        }
        const fastApiApps = inspected.filter(({ content }) => dependencyText.includes("fastapi") && /\bFastAPI\s*\(/.test(content));
        for (const { file, content } of fastApiApps.slice(0, 6)) {
            const variable = /\b([A-Za-z_]\w*)\s*=\s*FastAPI\s*\(/.exec(content)?.[1] ?? "app";
            addUniqueChoice(choices, choice("FastAPI development server", `${python} -m uvicorn ${pythonModule(file)}:${variable} --host 127.0.0.1 --port 8000`, `FastAPI application found in ${file}`, choices.length === 0, "http://127.0.0.1:8000"));
        }
        if (fastApiApps.length > 0 && projectType === "Python") {
            projectType = "FastAPI";
            evidence.push(`Found a FastAPI application in ${fastApiApps[0].file}.`);
        }
        const flaskApps = inspected.filter(({ content }) => dependencyText.includes("flask") && /\bFlask\s*\(/.test(content));
        for (const { file } of flaskApps.slice(0, 6))
            addUniqueChoice(choices, choice("Flask development server", `${python} -m flask --app ${pythonModule(file)} run --debug --host 127.0.0.1 --port 5000`, `Flask application or factory found in ${file}`, choices.length === 0, "http://127.0.0.1:5000"));
        if (flaskApps.length > 0 && projectType === "Python") {
            projectType = "Flask";
            evidence.push(`Found a Flask application in ${flaskApps[0].file}.`);
        }
        for (const documented of await readmePythonChoices(rootDir, python))
            addUniqueChoice(choices, documented);
        const commonNames = new Set(["main.py", "app.py", "server.py", "run.py", "start.py", "cli.py", "web.py", "api.py", "dashboard.py", "bot.py", "worker.py"]);
        const frameworkFiles = new Set([...streamlitApps, ...fastApiApps, ...flaskApps].map((item) => item.file));
        const directEntries = inspected
            .filter(({ file, content }) => !frameworkFiles.has(file) && (/if\s+__name__\s*==\s*["']__main__["']/.test(content) || commonNames.has(path.basename(file).toLowerCase())))
            .sort((left, right) => {
            const leftCommon = commonNames.has(path.basename(left.file).toLowerCase()) ? 0 : 1;
            const rightCommon = commonNames.has(path.basename(right.file).toLowerCase()) ? 0 : 1;
            return leftCommon - rightCommon || left.file.split(path.sep).length - right.file.split(path.sep).length || left.file.localeCompare(right.file);
        });
        for (const { file } of directEntries.slice(0, 8))
            addUniqueChoice(choices, choice(`Run ${file}`, `${python} "${file}"`, "Python executable entry point", choices.length === 0));
        if (directEntries.length > 0)
            evidence.push(`Found executable Python entr${directEntries.length === 1 ? "y" : "ies"} using common names or __main__ guards.`);
        const declaredScript = findPyprojectScript(pyprojectText);
        if (declaredScript) {
            const scriptVenv = venvName ?? ".venv";
            addUniqueChoice(choices, choice(`Run Python script: ${declaredScript}`, pythonScriptExecutable(scriptVenv, declaredScript), "Declared in the pyproject script table", choices.length === 0));
            evidence.push(`Found '${declaredScript}' in a pyproject script table.`);
        }
    }
    if (choices.length === 0)
        return undefined;
    choices.forEach((item, index) => item.recommended = index === 0);
    const result = candidate(rootDir, markerFile, path.basename(rootDir), projectType, evidence.length > 0 ? "high" : "medium", evidence, dependencyReport, choices);
    const plannedEnvironment = venvName ?? (dependencyReport.setupCommands.some((command) => /-m\s+venv\s+\.venv(?:\s|$)/.test(command)) ? ".venv" : undefined);
    if (plannedEnvironment)
        result.pythonEnvironment = plannedEnvironment;
    return result;
}
async function analyzeCargo(rootDir) {
    const marker = path.join(rootDir, "Cargo.toml");
    const content = await readText(marker);
    const packageName = /^name\s*=\s*["']([^"']+)/m.exec(content)?.[1] ?? path.basename(rootDir);
    return candidate(rootDir, marker, packageName, "Rust / Cargo", "high", ["Found Cargo.toml; cargo run is the standard binary-project command."], dependency("managed", "Cargo downloads and builds missing crates automatically when the project runs."), [choice("Run Cargo project", "cargo run", "Build and run the default binary", true)]);
}
async function analyzeGo(rootDir) {
    const marker = path.join(rootDir, "go.mod");
    const content = await readText(marker);
    const moduleName = /^module\s+(.+)$/m.exec(content)?.[1]?.trim() ?? path.basename(rootDir);
    return candidate(rootDir, marker, moduleName, "Go", "high", ["Found go.mod; go run . executes the package in the project directory."], dependency("managed", "Go downloads missing modules automatically when the project runs."), [choice("Run Go package", "go run .", "Compile and run the current package", true)]);
}
async function findJavaMainClass(rootDir) {
    const sourceRoot = path.join(rootDir, "src", "main", "java");
    async function walk(directory) {
        let entries;
        try {
            entries = await node_fs_1.promises.readdir(directory, { withFileTypes: true });
        }
        catch {
            return undefined;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const nested = await walk(path.join(directory, entry.name));
                if (nested)
                    return nested;
                continue;
            }
            if (!entry.isFile() || !entry.name.endsWith(".java"))
                continue;
            const filePath = path.join(directory, entry.name);
            const content = await readText(filePath);
            if (!/public\s+static\s+void\s+main\s*\(/.test(content))
                continue;
            const packageName = /^\s*package\s+([A-Za-z0-9_.]+)\s*;/m.exec(content)?.[1];
            const className = path.basename(entry.name, ".java");
            return packageName ? `${packageName}.${className}` : className;
        }
        return undefined;
    }
    return walk(sourceRoot);
}
async function analyzeMaven(rootDir) {
    const marker = path.join(rootDir, "pom.xml");
    const content = await readText(marker);
    const isSpring = content.includes("spring-boot");
    const usesExecPlugin = content.includes("exec-maven-plugin");
    const mainClass = /<mainClass>\s*([^<]+)\s*<\/mainClass>/i.exec(content)?.[1]?.trim() ?? await findJavaMainClass(rootDir);
    if (!isSpring && !usesExecPlugin && !mainClass)
        return undefined;
    const wrapper = process.platform === "win32" ? ".\\mvnw.cmd" : "./mvnw";
    const runner = (await pathExists(path.join(rootDir, process.platform === "win32" ? "mvnw.cmd" : "mvnw")))
        ? wrapper
        : "mvn";
    const command = isSpring
        ? `${runner} spring-boot:run`
        : mainClass
            ? `${runner} exec:java -Dexec.mainClass="${mainClass}"`
            : `${runner} exec:java`;
    return candidate(rootDir, marker, path.basename(rootDir), isSpring ? "Spring Boot / Maven" : "Java / Maven", "high", [
        isSpring
            ? "Found the Spring Boot Maven plugin."
            : mainClass
                ? `Found Java main class ${mainClass}.`
                : "Found the Maven exec plugin.",
    ], dependency("managed", "Maven resolves missing dependencies automatically."), [choice(isSpring ? "Run Spring Boot" : "Run configured main class", command, "Maven project command", true)]);
}
async function analyzeGradle(rootDir) {
    const markerName = (await pathExists(path.join(rootDir, "build.gradle.kts")))
        ? "build.gradle.kts"
        : "build.gradle";
    const marker = path.join(rootDir, markerName);
    const content = await readText(marker);
    const isSpring = content.includes("org.springframework.boot") || content.includes("spring-boot");
    const isApplication = /id\s*(?:\(|\s)["']application["']/i.test(content) ||
        /apply\s+plugin:\s*["']application["']/i.test(content) ||
        /mainClass(?:Name)?\s*[=.]/i.test(content);
    if (!isSpring && !isApplication)
        return undefined;
    const wrapperName = process.platform === "win32" ? "gradlew.bat" : "gradlew";
    const runner = (await pathExists(path.join(rootDir, wrapperName)))
        ? process.platform === "win32"
            ? ".\\gradlew.bat"
            : "./gradlew"
        : "gradle";
    return candidate(rootDir, marker, path.basename(rootDir), isSpring ? "Spring Boot / Gradle" : "Java / Gradle", "high", [isSpring ? "Found the Spring Boot Gradle plugin." : "Found a Gradle build with the standard run task."], dependency("managed", "Gradle resolves missing dependencies automatically."), [choice(isSpring ? "Run Spring Boot" : "Run Gradle application", `${runner} ${isSpring ? "bootRun" : "run"}`, "Gradle project task", true)]);
}
async function analyzeDotnet(rootDir, projectFile) {
    const marker = path.join(rootDir, projectFile);
    const content = await readText(marker);
    const isWeb = /<Project\s+Sdk=["'][^"']*\.Web["']/i.test(content);
    const isExecutable = /<OutputType>\s*(?:Exe|WinExe)\s*<\/OutputType>/i.test(content);
    if (!isWeb && !isExecutable)
        return undefined;
    const assets = path.join(rootDir, "obj", "project.assets.json");
    const deps = (await pathExists(assets))
        ? dependency("ready", "The .NET restore assets file is present.")
        : dependency("missing", "NuGet restore assets are missing.", ["dotnet restore"]);
    return candidate(rootDir, marker, path.basename(projectFile, path.extname(projectFile)), projectFile.toLowerCase().endsWith(".fsproj") ? "F# / .NET" : ".NET", "high", [(`Found ${projectFile}; dotnet run reads its launch and target settings.`)], deps, [choice("Run .NET project", `dotnet run --project "${projectFile}"`, projectFile, true)]);
}
async function analyzeFlutter(rootDir) {
    const marker = path.join(rootDir, "pubspec.yaml");
    const content = await readText(marker);
    const isFlutter = /^\s*flutter\s*:/m.test(content) || content.includes("sdk: flutter");
    const hasDartEntry = await pathExists(path.join(rootDir, "bin"));
    if (!isFlutter && !hasDartEntry)
        return undefined;
    const packageConfig = path.join(rootDir, ".dart_tool", "package_config.json");
    const deps = (await pathExists(packageConfig))
        ? dependency("ready", "Dart/Flutter package configuration is present.")
        : dependency("missing", "Dart/Flutter packages have not been resolved yet.", [isFlutter ? "flutter pub get" : "dart pub get"]);
    return candidate(rootDir, marker, /^name:\s*([^\s]+)/m.exec(content)?.[1] ?? path.basename(rootDir), isFlutter ? "Flutter" : "Dart", "high", [isFlutter ? "Flutter SDK dependency found in pubspec.yaml." : "Found a Dart pubspec.yaml."], deps, [choice(isFlutter ? "Run Flutter application" : "Run Dart application", isFlutter ? "flutter run" : "dart run", "SDK project command", true)]);
}
async function analyzeComposer(rootDir) {
    const marker = path.join(rootDir, "composer.json");
    const composer = await readJson(marker);
    const isLaravel = await pathExists(path.join(rootDir, "artisan"));
    const hasIndex = await pathExists(path.join(rootDir, "index.php"));
    const serveScript = composer?.scripts?.serve;
    if (!isLaravel && !hasIndex && !serveScript)
        return undefined;
    const autoload = path.join(rootDir, "vendor", "autoload.php");
    const deps = (await pathExists(autoload))
        ? dependency("ready", "Composer's vendor/autoload.php is present.")
        : dependency("missing", "Composer dependencies appear to be missing.", ["composer install"]);
    return candidate(rootDir, marker, composer?.name ?? path.basename(rootDir), isLaravel ? "Laravel" : "PHP / Composer", isLaravel ? "high" : "medium", [isLaravel ? "Found Laravel's artisan command." : "Found composer.json."], deps, [
        choice(isLaravel ? "Run Laravel development server" : "Run PHP development server", isLaravel
            ? "php artisan serve"
            : serveScript
                ? "composer run serve"
                : "php -S 127.0.0.1:8000", "PHP project command", true, isLaravel || !serveScript ? "http://127.0.0.1:8000" : undefined),
    ]);
}
async function analyzeRuby(rootDir) {
    const marker = path.join(rootDir, "Gemfile");
    const content = (await readText(marker)).toLowerCase();
    const isRails = content.includes("gem \"rails\"") || content.includes("gem 'rails'");
    const rubyEntry = (await pathExists(path.join(rootDir, "app.rb")))
        ? "app.rb"
        : (await pathExists(path.join(rootDir, "main.rb")))
            ? "main.rb"
            : undefined;
    if (!isRails && !rubyEntry)
        return undefined;
    const bundleMarker = path.join(rootDir, ".bundle");
    const deps = (await pathExists(bundleMarker))
        ? dependency("ready", "A local Bundler configuration is present.", [], ["Bundler will perform the final gem-version check."])
        : dependency("unknown", "Gem installation cannot be proven from project files alone.", ["bundle install"]);
    return candidate(rootDir, marker, path.basename(rootDir), isRails ? "Ruby on Rails" : "Ruby / Bundler", isRails ? "high" : "medium", [isRails ? "The Gemfile declares Rails." : "Found a Gemfile."], deps, [
        choice(isRails ? "Run Rails server" : `Run ${rubyEntry}`, isRails ? "bundle exec rails server" : `bundle exec ruby ${rubyEntry}`, "Bundler command", true, isRails ? "http://localhost:3000" : undefined),
    ]);
}
async function analyzeDocker(rootDir, markerName) {
    const marker = path.join(rootDir, markerName);
    return candidate(rootDir, marker, `${path.basename(rootDir)} containers`, "Docker Compose", "high", [(`Found ${markerName}; Docker Compose defines the runnable services.`)], dependency("managed", "Docker Compose pulls/builds missing images when it starts."), [choice("Start Docker Compose services", "docker compose up --build", "Build and attach to configured services", true)]);
}
async function analyzeCMake(rootDir) {
    const marker = path.join(rootDir, "CMakeLists.txt");
    const content = await readText(marker);
    const executable = /add_executable\s*\(\s*([^\s\)]+)/i.exec(content)?.[1];
    if (!executable)
        return undefined;
    const runCommand = process.platform === "win32"
        ? `.\\build\\Debug\\${executable}.exe`
        : `./build/${executable}`;
    const expected = process.platform === "win32"
        ? path.join(rootDir, "build", "Debug", `${executable}.exe`)
        : path.join(rootDir, "build", executable);
    const deps = (await pathExists(expected))
        ? dependency("ready", `Built executable '${executable}' is present.`)
        : dependency("missing", `Built executable '${executable}' is missing.`, ["cmake -S . -B build", "cmake --build build --config Debug"]);
    return candidate(rootDir, marker, executable, "C/C++ / CMake", "high", [`Found add_executable(${executable}) in CMakeLists.txt.`], deps, [choice(`Run ${executable}`, runCommand, "CMake executable target", true)]);
}
function preferredTaskNames(names) {
    const preferred = ["dev", "start", "run", "serve", "up", "watch", "preview"];
    return names
        .filter((name) => preferred.includes(name.toLowerCase()))
        .sort((left, right) => preferred.indexOf(left.toLowerCase()) - preferred.indexOf(right.toLowerCase()));
}
async function analyzeDeno(rootDir, markerName) {
    const marker = path.join(rootDir, markerName);
    const content = await readText(marker);
    const taskBlock = /["']tasks["']\s*:\s*\{([\s\S]*?)\}/i.exec(content)?.[1] ?? "";
    const taskNames = [...taskBlock.matchAll(/["']([^"']+)["']\s*:/g)].map((match) => match[1]);
    const selected = preferredTaskNames(taskNames);
    const choices = selected.map((name, index) => choice(`Deno task: ${name}`, `deno task ${name}`, "Declared in the Deno task configuration", index === 0));
    if (choices.length === 0) {
        for (const entry of ["main.ts", "main.js", "server.ts", "server.js", "mod.ts", "mod.js"]) {
            if (await pathExists(path.join(rootDir, entry))) {
                choices.push(choice(`Run ${entry} with Deno`, `deno run "${entry}"`, "Common Deno entry file; add permissions if the app requests them", true));
                break;
            }
        }
    }
    if (choices.length === 0)
        return undefined;
    const lockPresent = (await pathExists(path.join(rootDir, "deno.lock"))) || (await pathExists(path.join(rootDir, "deno.lock.json")));
    return candidate(rootDir, marker, path.basename(rootDir), "Deno", "high", [taskNames.length > 0 ? `Found ${taskNames.length} Deno task(s).` : "Found a common Deno entry file."], dependency("managed", lockPresent ? "Deno will use the checked-in lockfile and fetch missing modules." : "Deno fetches missing modules when the task runs."), choices);
}
function parseSimpleTargets(content) {
    return [...content.matchAll(/^([A-Za-z0-9][A-Za-z0-9_.-]*):(?:\s|$)/gm)]
        .map((match) => match[1])
        .filter((name) => !name.includes("%"));
}
async function analyzeTaskRunner(rootDir, markerName) {
    const marker = path.join(rootDir, markerName);
    const content = await readText(marker);
    const lower = markerName.toLowerCase();
    let runner;
    let targets;
    let projectType;
    if (lower === "makefile") {
        runner = "make";
        targets = parseSimpleTargets(content);
        projectType = "Make";
    }
    else if (lower === "justfile") {
        runner = "just";
        targets = parseSimpleTargets(content);
        projectType = "Just";
    }
    else {
        runner = "task";
        targets = [...content.matchAll(/^\s{2}([A-Za-z0-9][A-Za-z0-9_.-]*):\s*(?:#.*)?$/gm)].map((match) => match[1]);
        projectType = "Taskfile";
    }
    const selected = preferredTaskNames(targets);
    if (selected.length === 0)
        return undefined;
    return candidate(rootDir, marker, path.basename(rootDir), projectType, "high", [`Found runnable target(s): ${selected.join(", ")}.`], dependency("unknown", `${projectType} can orchestrate setup, but dependency readiness cannot be proven from the task file alone.`), selected.map((target, index) => choice(`${projectType} target: ${target}`, `${runner} ${target}`, `Declared in ${markerName}`, index === 0)));
}
async function analyzeProcfile(rootDir) {
    const marker = path.join(rootDir, "Procfile");
    const content = await readText(marker);
    const processes = [...content.matchAll(/^([A-Za-z0-9_-]+):\s*(.+)$/gm)]
        .map((match) => ({ name: match[1], command: match[2].trim() }))
        .filter((item) => item.command.length > 0);
    if (processes.length === 0)
        return undefined;
    processes.sort((left, right) => (left.name === "web" ? -1 : right.name === "web" ? 1 : left.name.localeCompare(right.name)));
    return candidate(rootDir, marker, path.basename(rootDir), "Procfile application", "high", ["Found process commands declared in Procfile."], dependency("unknown", "The Procfile defines launch commands but does not prove dependency readiness."), processes.slice(0, 8).map((item, index) => choice(`Run ${item.name} process`, item.command, "Declared in Procfile", index === 0)));
}
async function analyzeSwift(rootDir) {
    const marker = path.join(rootDir, "Package.swift");
    const content = await readText(marker);
    if (!/\.(?:executable|executableTarget)\s*\(/.test(content))
        return undefined;
    const packageName = /name\s*:\s*["']([^"']+)/.exec(content)?.[1] ?? path.basename(rootDir);
    return candidate(rootDir, marker, packageName, "Swift Package", "high", ["Found Package.swift; swift run builds and runs an executable target."], dependency("managed", "Swift Package Manager resolves and builds missing dependencies."), [choice("Run Swift package", "swift run", "Build and run the default executable product", true)]);
}
async function analyzeElixir(rootDir) {
    const marker = path.join(rootDir, "mix.exs");
    const content = await readText(marker);
    const phoenix = /\{:phoenix\s*,/.test(content);
    const depsReady = await pathExists(path.join(rootDir, "deps"));
    return candidate(rootDir, marker, path.basename(rootDir), phoenix ? "Phoenix / Elixir" : "Elixir / Mix", "high", [phoenix ? "Found Phoenix in mix.exs." : "Found an Elixir Mix project."], depsReady ? dependency("ready", "The Mix dependencies directory is present.") : dependency("missing", "Mix dependencies have not been fetched in this project.", ["mix deps.get"]), [choice(phoenix ? "Run Phoenix server" : "Run Mix application", phoenix ? "mix phx.server" : "mix run --no-halt", "Standard Mix project command", true)]);
}
async function analyzeR(rootDir) {
    const appName = (await listRootFiles(rootDir)).find((file) => file.toLowerCase() === "app.r");
    if (!appName)
        return undefined;
    const marker = path.join(rootDir, appName);
    const content = await readText(marker);
    const shiny = /\b(?:library|require)\s*\(\s*shiny\s*\)|\bshiny::/i.test(content);
    return candidate(rootDir, marker, path.basename(rootDir), shiny ? "R Shiny" : "R", shiny ? "high" : "medium", [shiny ? "Found a Shiny app.R entry file." : "Found app.R."], dependency("unknown", "Installed R packages cannot be proven from project files alone."), [choice(shiny ? "Run Shiny application" : "Run R application", shiny ? `Rscript -e "shiny::runApp('${appName}', host='127.0.0.1', port=3838)"` : `Rscript "${appName}"`, "R project entry command", true, shiny ? "http://127.0.0.1:3838" : undefined)]);
}
async function analyzeStaticSite(rootDir) {
    const marker = path.join(rootDir, "index.html");
    const python = process.platform === "win32" ? "python" : "python3";
    return candidate(rootDir, marker, path.basename(rootDir), "Static website", "medium", ["Found index.html without another recognized project manifest."], dependency("ready", "A static website has no project dependencies to install."), [choice("Serve static website", `${python} -m http.server 8000 --bind 127.0.0.1`, "Serve on http://127.0.0.1:8000", true, "http://127.0.0.1:8000")]);
}
async function analyzeCustom(rootDir) {
    const marker = path.join(rootDir, ".runready.json");
    const config = await readJson(marker);
    if (!config)
        return undefined;
    const configuredCommands = Array.isArray(config.commands)
        ? config.commands
        : typeof config.command === "string"
            ? [{ label: "Run project", command: config.command, recommended: true }]
            : [];
    const runChoices = configuredCommands
        .filter((item) => item && typeof item.command === "string" && item.command.trim().length > 0)
        .map((item, index) => choice(typeof item.label === "string" && item.label.trim().length > 0
        ? item.label
        : `Run command ${index + 1}`, item.command.trim(), typeof item.description === "string" ? item.description : "Declared in .runready.json", item.recommended === true || index === 0));
    if (runChoices.length === 0)
        return undefined;
    const setupCommands = Array.isArray(config.setupCommands)
        ? config.setupCommands.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
        : [];
    const allowedStates = new Set(["ready", "missing", "managed", "unknown"]);
    const requestedState = typeof config.dependencyState === "string" ? config.dependencyState : "unknown";
    const dependencyState = allowedStates.has(requestedState) ? requestedState : "unknown";
    const summary = typeof config.dependencySummary === "string" && config.dependencySummary.trim().length > 0
        ? config.dependencySummary.trim()
        : setupCommands.length > 0
            ? "A custom setup command is available; dependency readiness is user-defined."
            : "This custom project does not declare an automatic dependency check.";
    return candidate(rootDir, marker, typeof config.name === "string" && config.name.trim().length > 0 ? config.name.trim() : path.basename(rootDir), typeof config.projectType === "string" && config.projectType.trim().length > 0 ? config.projectType.trim() : "Custom project", "high", ["Found an explicit .runready.json project definition."], dependency(dependencyState, summary, setupCommands), runChoices);
}
async function analyzeDirectory(entry, scanRoot) {
    const { directory, files } = entry;
    const lowerFiles = new Map([...files].map((file) => [file.toLowerCase(), file]));
    const results = [];
    if (lowerFiles.has(".runready.json")) {
        const result = await analyzeCustom(directory);
        if (result)
            return [result];
    }
    if (lowerFiles.has("package.json")) {
        const result = await analyzeNode(directory, scanRoot);
        if (result)
            results.push(result);
    }
    const hasPythonMarker = lowerFiles.has("manage.py") ||
        lowerFiles.has("pyproject.toml") ||
        lowerFiles.has("pipfile") ||
        lowerFiles.has("setup.py") ||
        lowerFiles.has("setup.cfg") ||
        lowerFiles.has("environment.yml") ||
        lowerFiles.has("environment.yaml") ||
        [...lowerFiles.keys()].some((file) => /^requirements(?:[-_.][a-z0-9_.-]+)?\.txt$/.test(file));
    if (hasPythonMarker) {
        const result = await analyzePython(directory);
        if (result)
            results.push(result);
    }
    if (lowerFiles.has("cargo.toml"))
        results.push(await analyzeCargo(directory));
    if (lowerFiles.has("go.mod"))
        results.push(await analyzeGo(directory));
    if (lowerFiles.has("pom.xml")) {
        const result = await analyzeMaven(directory);
        if (result)
            results.push(result);
    }
    if (lowerFiles.has("build.gradle") || lowerFiles.has("build.gradle.kts")) {
        const result = await analyzeGradle(directory);
        if (result)
            results.push(result);
    }
    const dotnetFile = [...files].find((file) => /\.(cs|fs)proj$/i.test(file));
    if (dotnetFile) {
        const result = await analyzeDotnet(directory, dotnetFile);
        if (result)
            results.push(result);
    }
    if (lowerFiles.has("pubspec.yaml")) {
        const result = await analyzeFlutter(directory);
        if (result)
            results.push(result);
    }
    if (lowerFiles.has("composer.json")) {
        const result = await analyzeComposer(directory);
        if (result)
            results.push(result);
    }
    if (lowerFiles.has("gemfile")) {
        const result = await analyzeRuby(directory);
        if (result)
            results.push(result);
    }
    const composeFile = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"]
        .map((name) => lowerFiles.get(name))
        .find(Boolean);
    if (composeFile)
        results.push(await analyzeDocker(directory, composeFile));
    if (lowerFiles.has("cmakelists.txt")) {
        const result = await analyzeCMake(directory);
        if (result)
            results.push(result);
    }
    const denoFile = lowerFiles.get("deno.json") ?? lowerFiles.get("deno.jsonc");
    if (denoFile) {
        const result = await analyzeDeno(directory, denoFile);
        if (result)
            results.push(result);
    }
    for (const taskFileName of ["makefile", "justfile", "taskfile.yml", "taskfile.yaml"]) {
        const taskFile = lowerFiles.get(taskFileName);
        if (!taskFile)
            continue;
        const result = await analyzeTaskRunner(directory, taskFile);
        if (result)
            results.push(result);
    }
    if (lowerFiles.has("procfile")) {
        const result = await analyzeProcfile(directory);
        if (result)
            results.push(result);
    }
    if (lowerFiles.has("package.swift"))
        results.push(await analyzeSwift(directory));
    if (lowerFiles.has("mix.exs"))
        results.push(await analyzeElixir(directory));
    if (lowerFiles.has("app.r")) {
        const result = await analyzeR(directory);
        if (result)
            results.push(result);
    }
    if (lowerFiles.has("index.html") && results.length === 0) {
        results.push(await analyzeStaticSite(directory));
    }
    return results;
}
async function analyzeWorkspace(rootDir, maxDepth = 6) {
    const entries = await discoverMarkers(rootDir, maxDepth);
    const nested = await Promise.all(entries.map((entry) => analyzeDirectory(entry, rootDir)));
    const candidates = nested.flat().filter((item) => item.runChoices.length > 0);
    candidates.sort((left, right) => {
        const leftDepth = path.relative(rootDir, left.rootDir).split(path.sep).filter(Boolean).length;
        const rightDepth = path.relative(rootDir, right.rootDir).split(path.sep).filter(Boolean).length;
        if (leftDepth !== rightDepth)
            return leftDepth - rightDepth;
        return left.name.localeCompare(right.name);
    });
    return candidates;
}
//# sourceMappingURL=analyzer.js.map
