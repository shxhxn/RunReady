const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "runready-test-"));
const projectRoot = path.join(fixtureRoot, "workspace");
const appRoot = path.join(projectRoot, "ibvap");
const activeFile = path.join(appRoot, "backend", "app", "database.py");
fs.mkdirSync(path.dirname(activeFile), { recursive: true });
fs.writeFileSync(path.join(appRoot, "requirements.txt"), "fastapi==0.115.0\nuvicorn==0.30.0\n");
fs.writeFileSync(path.join(appRoot, "backend", "app", "main.py"), "from fastapi import FastAPI\napp = FastAPI()\n");
fs.writeFileSync(activeFile, "# active editor fixture\n");
const commands = new Map();
let terminalText;
let addNewLine;
let copiedText;
let information;
let failure;
let occupiedServer;

const terminal = {
  show() {},
  sendText(text, execute) {
    terminalText = text;
    addNewLine = execute;
  },
};

const vscode = {
  StatusBarAlignment: { Left: 1 },
  ProgressLocation: { Window: 10 },
  Uri: { file: (fsPath) => ({ scheme: "file", fsPath }) },
  workspace: {
    workspaceFolders: [{ name: "workspace", uri: { scheme: "file", fsPath: projectRoot } }],
    isTrusted: true,
    getConfiguration(section) {
      return {
        get(_key, fallback) {
          return section === "terminal.integrated" ? null : fallback;
        },
      };
    },
  },
  window: {
    activeTerminal: terminal,
    activeTextEditor: {
      document: {
        uri: {
          scheme: "file",
          fsPath: activeFile,
        },
      },
    },
    createOutputChannel() {
      return { clear() {}, appendLine() {}, show() {}, dispose() {} };
    },
    createStatusBarItem() {
      return { show() {}, hide() {}, dispose() {} };
    },
    createTerminal() {
      throw new Error("An active terminal should be reused");
    },
    withProgress(_options, task) {
      return task();
    },
    showQuickPick(items) {
      if (items.some((item) => item.candidate)) {
        throw new Error("The active backend file should select the FastAPI project automatically");
      }
      return Promise.resolve(items[0]);
    },
    showWarningMessage() {},
    showInformationMessage(message) {
      information = message;
    },
    showErrorMessage(message) {
      failure = message;
    },
  },
  commands: {
    registerCommand(id, handler) {
      commands.set(id, handler);
      return { dispose() {} };
    },
  },
  env: {
    clipboard: {
      writeText(text) {
        copiedText = text;
        return Promise.resolve();
      },
    },
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "vscode") return vscode;
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const extension = require("./out/extension");
    const { analyzeWorkspace } = require("./out/analyzer");
    const { createCommandPlan } = require("./out/shell");
    extension.activate({ subscriptions: [] });
    await commands.get("runready.findAndRun")();
    assert.equal(failure, undefined);
    assert.equal(addNewLine, false);
    assert.equal(copiedText, terminalText);
    assert.match(terminalText, /backend\.app\.main:app/);
    assert.match(terminalText, /Set-Location -LiteralPath/);
    assert.match(information, /Press Enter/);
    assert.match(information, /dependencies missing/i);
    assert.match(information, /http:\/\/127\.0\.0\.1:8000/);

    const customRoot = path.join(fixtureRoot, "custom-project");
    fs.mkdirSync(customRoot, { recursive: true });
    fs.writeFileSync(path.join(customRoot, ".runready.json"), JSON.stringify({
      name: "Custom worker",
      projectType: "Private toolchain",
      command: "acme-worker serve",
      setupCommands: ["acme-worker install"],
      dependencyState: "unknown",
    }));
    const customCandidates = await analyzeWorkspace(customRoot);
    assert.equal(customCandidates.length, 1);
    assert.equal(customCandidates[0].name, "Custom worker");
    assert.equal(customCandidates[0].runChoices[0].command, "acme-worker serve");
    assert.deepEqual(customCandidates[0].dependencies.setupCommands, ["acme-worker install"]);

    const streamlitRoot = path.join(fixtureRoot, "sebi-regtech");
    fs.mkdirSync(streamlitRoot, { recursive: true });
    fs.writeFileSync(path.join(streamlitRoot, "requirements.txt"), "streamlit\npydantic\nrequests\n");
    fs.writeFileSync(path.join(streamlitRoot, "dashboard.py"), "import streamlit as st\nst.title('RegTech')\n");
    fs.writeFileSync(path.join(streamlitRoot, "README.md"), "## Running it\n`streamlit run dashboard.py`\n");
    const streamlitCandidates = await analyzeWorkspace(streamlitRoot);
    assert.equal(streamlitCandidates.length, 1);
    assert.equal(streamlitCandidates[0].projectType, "Streamlit");
    assert.match(streamlitCandidates[0].runChoices[0].command, /python\.exe -m streamlit run "dashboard\.py"/);
    assert.equal(streamlitCandidates[0].dependencies.state, "missing");
    assert.match(streamlitCandidates[0].dependencies.setupCommands[1], /pip install -r "requirements\.txt"/);
    assert.equal(streamlitCandidates[0].pythonEnvironment, ".venv");
    const streamlitPlan = createCommandPlan(streamlitCandidates[0], streamlitCandidates[0].runChoices[0], "powershell", true);
    assert.match(streamlitPlan.fullCommand, /python -m venv \.venv/);
    assert.match(streamlitPlan.fullCommand, /\$env:VIRTUAL_ENV -ne \$runreadyVenv/);
    assert.ok(streamlitPlan.fullCommand.includes(".\\.venv\\Scripts\\python.exe"));
    assert.ok(streamlitPlan.fullCommand.indexOf("python -m venv .venv") < streamlitPlan.fullCommand.indexOf("$env:VIRTUAL_ENV"));

    const brokenVenvRoot = path.join(fixtureRoot, "broken-venv");
    fs.mkdirSync(path.join(brokenVenvRoot, ".venv"), { recursive: true });
    fs.writeFileSync(path.join(brokenVenvRoot, ".venv", "pyvenv.cfg"), "home = missing\n");
    fs.writeFileSync(path.join(brokenVenvRoot, "requirements.txt"), "flask\n");
    fs.writeFileSync(path.join(brokenVenvRoot, "app.py"), "from flask import Flask\napp = Flask(__name__)\n");
    const brokenVenvCandidates = await analyzeWorkspace(brokenVenvRoot);
    assert.equal(brokenVenvCandidates.length, 1);
    assert.equal(brokenVenvCandidates[0].dependencies.state, "missing");
    assert.match(brokenVenvCandidates[0].dependencies.summary, /incomplete or incompatible/);
    assert.match(brokenVenvCandidates[0].dependencies.setupCommands[0], /python -m venv \.venv/);

    const validVenvRoot = path.join(fixtureRoot, "valid-venv");
    fs.mkdirSync(path.join(validVenvRoot, ".venv", "Scripts"), { recursive: true });
    fs.writeFileSync(path.join(validVenvRoot, ".venv", "pyvenv.cfg"), "home = test\n");
    fs.writeFileSync(path.join(validVenvRoot, ".venv", "Scripts", "python.exe"), "fixture\n");
    fs.writeFileSync(path.join(validVenvRoot, "requirements.txt"), "flask\n");
    fs.writeFileSync(path.join(validVenvRoot, "app.py"), "from flask import Flask\napp = Flask(__name__)\n");
    const validVenvCandidates = await analyzeWorkspace(validVenvRoot);
    assert.equal(validVenvCandidates[0].pythonEnvironment, ".venv");
    assert.ok(validVenvCandidates[0].runChoices[0].command.includes(".\\.venv\\Scripts\\python.exe"));

    const uncommonPythonRoot = path.join(fixtureRoot, "uncommon-python-entry");
    fs.mkdirSync(uncommonPythonRoot, { recursive: true });
    fs.writeFileSync(path.join(uncommonPythonRoot, "requirements-dev.txt"), "rich\n");
    fs.writeFileSync(path.join(uncommonPythonRoot, "launch_console.py"), "def main(): pass\nif __name__ == '__main__':\n    main()\n");
    const uncommonCandidates = await analyzeWorkspace(uncommonPythonRoot);
    assert.equal(uncommonCandidates.length, 1);
    assert.match(uncommonCandidates[0].runChoices[0].command, /launch_console\.py/);

    const denoRoot = path.join(fixtureRoot, "deno-app");
    fs.mkdirSync(denoRoot, { recursive: true });
    fs.writeFileSync(path.join(denoRoot, "deno.json"), JSON.stringify({ tasks: { dev: "deno run --watch main.ts" } }));
    const denoCandidates = await analyzeWorkspace(denoRoot);
    assert.equal(denoCandidates[0].runChoices[0].command, "deno task dev");

    const makeRoot = path.join(fixtureRoot, "make-app");
    fs.mkdirSync(makeRoot, { recursive: true });
    fs.writeFileSync(path.join(makeRoot, "Makefile"), "dev:\n\t./scripts/dev.sh\n");
    const makeCandidates = await analyzeWorkspace(makeRoot);
    assert.equal(makeCandidates[0].runChoices[0].command, "make dev");

    const staticRoot = path.join(fixtureRoot, "weather-app");
    fs.mkdirSync(staticRoot, { recursive: true });
    fs.writeFileSync(path.join(staticRoot, "index.html"), "<!doctype html><title>Weather</title>\n");
    const staticCandidates = await analyzeWorkspace(staticRoot);
    assert.equal(staticCandidates.length, 1);
    assert.match(staticCandidates[0].runChoices[0].command, /http\.server 8000 --bind 127\.0\.0\.1/);
    assert.equal(staticCandidates[0].runChoices[0].url, "http://127.0.0.1:8000");

    const flaskFactoryRoot = path.join(fixtureRoot, "flask-factory");
    fs.mkdirSync(flaskFactoryRoot, { recursive: true });
    fs.writeFileSync(path.join(flaskFactoryRoot, "requirements.txt"), "flask\n");
    fs.writeFileSync(path.join(flaskFactoryRoot, "app.py"), "from flask import Flask\ndef create_app():\n    portal = Flask(__name__)\n    return portal\n");
    const flaskFactoryCandidates = await analyzeWorkspace(flaskFactoryRoot);
    assert.equal(flaskFactoryCandidates.length, 1);
    assert.match(flaskFactoryCandidates[0].runChoices[0].command, /flask --app app run --debug --host 127\.0\.0\.1 --port 5000/);
    assert.doesNotMatch(flaskFactoryCandidates[0].runChoices[0].command, /app:app/);
    assert.equal(flaskFactoryCandidates[0].runChoices[0].url, "http://127.0.0.1:5000");

    const tailwindRoot = path.join(fixtureRoot, "tailwind-app");
    fs.mkdirSync(path.join(tailwindRoot, "node_modules", "next"), { recursive: true });
    fs.mkdirSync(path.join(tailwindRoot, "app"), { recursive: true });
    fs.writeFileSync(path.join(tailwindRoot, "package.json"), JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "latest" } }));
    fs.writeFileSync(path.join(tailwindRoot, "app", "globals.css"), '@import "tailwindcss";\n');
    const tailwindCandidates = await analyzeWorkspace(tailwindRoot);
    assert.equal(tailwindCandidates.length, 1);
    assert.equal(tailwindCandidates[0].dependencies.state, "missing");
    assert.deepEqual(tailwindCandidates[0].dependencies.setupCommands, ["npm install tailwindcss"]);
    assert.equal(tailwindCandidates[0].runChoices[0].url, "http://localhost:3000");

    occupiedServer = net.createServer();
    await new Promise((resolve, reject) => {
      occupiedServer.once("error", reject);
      occupiedServer.listen(0, "127.0.0.1", resolve);
    });
    const occupiedPort = occupiedServer.address().port;
    const occupiedPortRoot = path.join(fixtureRoot, "occupied-port-app");
    fs.mkdirSync(path.join(occupiedPortRoot, "backend"), { recursive: true });
    fs.writeFileSync(path.join(occupiedPortRoot, "package.json"), JSON.stringify({ scripts: { start: "node backend/server.js" } }));
    fs.writeFileSync(path.join(occupiedPortRoot, "backend", "server.js"), `const DEFAULT_PORT = ${occupiedPort};\nconst port = Number(process.env.PORT) || DEFAULT_PORT;\nserver.listen(port);\n`);
    const occupiedPortCandidates = await analyzeWorkspace(occupiedPortRoot);
    const occupiedChoice = occupiedPortCandidates[0].runChoices[0];
    assert.notEqual(Number(occupiedChoice.environmentVariables.PORT), occupiedPort);
    assert.match(occupiedChoice.notice, new RegExp(`Port ${occupiedPort} is already in use`));
    assert.equal(occupiedChoice.url, `http://localhost:${occupiedChoice.environmentVariables.PORT}`);
    const occupiedPlan = createCommandPlan(occupiedPortCandidates[0], occupiedChoice, "powershell", true);
    assert.ok(occupiedPlan.fullCommand.includes(`$env:PORT = '${occupiedChoice.environmentVariables.PORT}'`));
    const occupiedBashPlan = createCommandPlan(occupiedPortCandidates[0], occupiedChoice, "bash", true);
    assert.ok(occupiedBashPlan.fullCommand.includes(`export PORT='${occupiedChoice.environmentVariables.PORT}'`));
    const occupiedCmdPlan = createCommandPlan(occupiedPortCandidates[0], occupiedChoice, "cmd", true);
    assert.ok(occupiedCmdPlan.fullCommand.includes(`set "PORT=${occupiedChoice.environmentVariables.PORT}"`));
    await new Promise((resolve) => occupiedServer.close(resolve));
    occupiedServer = undefined;
    console.log("RunReady integration smoke test passed");
  } finally {
    Module._load = originalLoad;
    if (occupiedServer?.listening)
      await new Promise((resolve) => occupiedServer.close(resolve));
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
