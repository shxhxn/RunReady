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
const path = __importStar(require("node:path"));
const EXACT_MARKERS = new Set([
    ".runready.json",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
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
function choice(label, command, description, recommended = false) {
    return { label, command, description, recommended };
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
    if (names.length === 0) {
        return dependency("ready", "No npm dependencies are declared.");
    }
    if ((await pathExists(path.join(rootDir, ".pnp.cjs"))) ||
        (await pathExists(path.join(rootDir, ".pnp.js")))) {
        return dependency("ready", "Yarn Plug'n'Play dependency map found.");
    }
    const checks = await Promise.all(names.map(async (name) => ({
        name,
        found: await findDependencyDirectory(rootDir, scanRoot, name),
    })));
    const missing = checks.filter((item) => !item.found).map((item) => item.name);
    if (missing.length === 0) {
        return dependency("ready", `All ${names.length} directly declared dependencies are installed.`, [], ["Checked direct dependencies in node_modules, including hoisted workspace packages."]);
    }
    const preview = missing.slice(0, 6).join(", ");
    return dependency("missing", `${missing.length} of ${names.length} direct dependencies appear to be missing.`, [installCommand(manager)], [`Missing: ${preview}${missing.length > 6 ? ", …" : ""}`]);
}
async function analyzeNode(rootDir, scanRoot) {
    const packagePath = path.join(rootDir, "package.json");
    const pkg = await readJson(packagePath);
    if (!pkg)
        return undefined;
    const manager = await detectPackageManager(rootDir, pkg);
    const scripts = pkg.scripts ?? {};
    const preferred = ["dev", "start", "serve", "preview", "develop", "watch"];
    const likelyScripts = Object.keys(scripts).filter((name) => preferred.includes(name) || /^(dev|start|serve|preview)(:|$)/.test(name));
    likelyScripts.sort((left, right) => {
        const leftIndex = preferred.indexOf(left);
        const rightIndex = preferred.indexOf(right);
        return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
    });
    const runChoices = likelyScripts.map((name, index) => choice(`${manager} script: ${name}`, scriptCommand(manager, name), scripts[name], index === 0));
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
    const projectType = detectNodeType(pkg);
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
async function findNestedPythonEntry(rootDir) {
    const commonLayouts = [
        path.join("backend", "app", "main.py"),
        path.join("backend", "main.py"),
        path.join("app", "main.py"),
        path.join("src", "main.py"),
        path.join("src", "app.py"),
    ];
    for (const relativePath of commonLayouts) {
        if (await pathExists(path.join(rootDir, relativePath))) {
            return relativePath;
        }
    }
    return undefined;
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
async function missingPythonRequirements(rootDir, venvName) {
    const requirementsPath = path.join(rootDir, "requirements.txt");
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
    const venvName = (await pathExists(path.join(rootDir, ".venv")))
        ? ".venv"
        : (await pathExists(path.join(rootDir, "venv")))
            ? "venv"
            : undefined;
    const requirements = await pathExists(path.join(rootDir, "requirements.txt"));
    const pyproject = await pathExists(path.join(rootDir, "pyproject.toml"));
    if (!requirements && !pyproject) {
        return dependency("ready", "No Python dependency manifest was found.");
    }
    if (venvName) {
        if (requirements) {
            const requirementNames = parseRequirementNames(await readText(path.join(rootDir, "requirements.txt")));
            const missing = await missingPythonRequirements(rootDir, venvName);
            if (missing.length === 0 && requirementNames.length > 0) {
                return dependency("ready", `All ${requirementNames.length} directly declared Python dependencies are installed.`, [], ["Checked installed distribution metadata in the local virtual environment."]);
            }
            if (missing.length > 0) {
                return dependency("missing", `${missing.length} of ${requirementNames.length} directly declared Python dependencies appear to be missing.`, [`${pythonExecutable(venvName)} -m pip install -r requirements.txt`], [`Missing: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ", …" : ""}`]);
            }
        }
        return dependency("unknown", `Local Python environment '${venvName}' exists, but its complete package set was not proven.`, [
            requirements
                ? `${pythonExecutable(venvName)} -m pip install -r requirements.txt`
                : `${pythonExecutable(venvName)} -m pip install -e .`,
        ], ["The idempotent installer step is included to verify and repair package versions before launch."]);
    }
    const globalPython = pythonExecutable(undefined);
    const localPython = pythonExecutable(".venv");
    const setupCommands = [`${globalPython} -m venv .venv`];
    if (requirements) {
        setupCommands.push(`${localPython} -m pip install -r requirements.txt`);
    }
    else {
        setupCommands.push(`${localPython} -m pip install -e .`);
    }
    return dependency("missing", "Python dependencies are declared, but no local virtual environment was found.", setupCommands, ["RunReady uses .venv directly, so shell activation is not required."]);
}
async function analyzePython(rootDir) {
    const managePy = path.join(rootDir, "manage.py");
    const requirementsPath = path.join(rootDir, "requirements.txt");
    const pyprojectPath = path.join(rootDir, "pyproject.toml");
    const markerFile = (await pathExists(managePy))
        ? managePy
        : (await pathExists(pyprojectPath))
            ? pyprojectPath
            : requirementsPath;
    const hasPythonMarker = (await pathExists(managePy)) ||
        (await pathExists(requirementsPath)) ||
        (await pathExists(pyprojectPath));
    if (!hasPythonMarker)
        return undefined;
    const venvName = (await pathExists(path.join(rootDir, ".venv")))
        ? ".venv"
        : (await pathExists(path.join(rootDir, "venv")))
            ? "venv"
            : undefined;
    const python = pythonExecutable(venvName ?? ((await pythonDependencyReport(rootDir)).state === "missing" ? ".venv" : undefined));
    const dependencyText = `${await readText(requirementsPath)}\n${await readText(pyprojectPath)}`.toLowerCase();
    const pyprojectText = await readText(pyprojectPath);
    const choices = [];
    let projectType = "Python";
    const evidence = [];
    if (await pathExists(managePy)) {
        projectType = "Django";
        choices.push(choice("Django development server", `${python} manage.py runserver`, "manage.py found", true));
        evidence.push("Found manage.py, which is Django's project runner.");
    }
    else {
        const possibleEntries = ["main.py", "app.py", "server.py", "run.py"];
        let existingEntry;
        for (const file of possibleEntries) {
            if (await pathExists(path.join(rootDir, file))) {
                existingEntry = file;
                break;
            }
        }
        existingEntry ??= await findNestedPythonEntry(rootDir);
        if (dependencyText.includes("fastapi") && existingEntry) {
            projectType = "FastAPI";
            const moduleName = existingEntry
                .replace(/\.py$/i, "")
                .split(path.sep)
                .join(".");
            choices.push(choice("FastAPI development server", `${python} -m uvicorn ${moduleName}:app --host 0.0.0.0 --port 8000`, `FastAPI dependency and ${existingEntry} found`, true));
            evidence.push(`FastAPI is declared and ${existingEntry} contains the application entry point.`);
        }
        else if (dependencyText.includes("flask") && existingEntry) {
            projectType = "Flask";
            const moduleName = existingEntry
                .replace(/\.py$/i, "")
                .split(path.sep)
                .join(".");
            choices.push(choice("Flask development server", `${python} -m flask --app ${moduleName} run --debug`, `Flask dependency and ${existingEntry} found`, true));
            evidence.push("Flask is declared in the Python dependency manifest.");
        }
        else if (existingEntry) {
            choices.push(choice(`Run ${existingEntry}`, `${python} "${existingEntry}"`, "Common Python entry file", true));
            evidence.push(`Found common Python entry file ${existingEntry}.`);
        }
        else {
            const declaredScript = findPyprojectScript(pyprojectText);
            if (declaredScript) {
                const scriptVenv = venvName ?? ".venv";
                choices.push(choice(`Run Python script: ${declaredScript}`, pythonScriptExecutable(scriptVenv, declaredScript), "Declared in the pyproject script table", true));
                evidence.push(`Found '${declaredScript}' in a pyproject script table.`);
            }
        }
    }
    if (choices.length === 0)
        return undefined;
    return candidate(rootDir, markerFile, path.basename(rootDir), projectType, "high", evidence, await pythonDependencyReport(rootDir), choices);
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
async function analyzeMaven(rootDir) {
    const marker = path.join(rootDir, "pom.xml");
    const content = await readText(marker);
    const isSpring = content.includes("spring-boot");
    const usesExecPlugin = content.includes("exec-maven-plugin");
    const mainClass = /<mainClass>\s*([^<]+)\s*<\/mainClass>/i.exec(content)?.[1]?.trim();
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
                ? `Found configured Maven main class ${mainClass}.`
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
                : "php -S localhost:8000", "PHP project command", true),
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
        choice(isRails ? "Run Rails server" : `Run ${rubyEntry}`, isRails ? "bundle exec rails server" : `bundle exec ruby ${rubyEntry}`, "Bundler command", true),
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
async function analyzeStaticSite(rootDir) {
    const marker = path.join(rootDir, "index.html");
    const python = process.platform === "win32" ? "python" : "python3";
    return candidate(rootDir, marker, path.basename(rootDir), "Static website", "medium", ["Found index.html without another recognized project manifest."], dependency("ready", "A static website has no project dependencies to install."), [choice("Serve static website", `${python} -m http.server 8000`, "Serve on http://localhost:8000", true)]);
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
    if (lowerFiles.has("manage.py") ||
        lowerFiles.has("pyproject.toml") ||
        lowerFiles.has("requirements.txt")) {
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
