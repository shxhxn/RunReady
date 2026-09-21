const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
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
    extension.activate({ subscriptions: [] });
    await commands.get("runready.findAndRun")();
    assert.equal(failure, undefined);
    assert.equal(addNewLine, false);
    assert.equal(copiedText, terminalText);
    assert.match(terminalText, /backend\.app\.main:app/);
    assert.match(terminalText, /Set-Location -LiteralPath/);
    assert.match(information, /Press Enter/);

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
    console.log("RunReady integration smoke test passed");
  } finally {
    Module._load = originalLoad;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
