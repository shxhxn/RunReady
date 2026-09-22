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
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("node:path"));
const node_fs_1 = require("node:fs");
const vscode = __importStar(require("vscode"));
const analyzer_1 = require("./analyzer");
const shell_1 = require("./shell");
const statePresentation = {
    ready: { icon: "$(pass-filled)", label: "dependencies ready" },
    missing: { icon: "$(warning)", label: "dependencies missing" },
    managed: { icon: "$(sync)", label: "dependencies handled automatically" },
    unknown: { icon: "$(question)", label: "dependency state uncertain" },
};
let output;
function containingWorkspace(directory) {
    return vscode.workspace.workspaceFolders?.find((folder) => {
        const relative = path.relative(folder.uri.fsPath, directory);
        return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    });
}
function candidateLocation(item) {
    const workspace = containingWorkspace(item.rootDir);
    if (!workspace)
        return item.rootDir;
    const relative = path.relative(workspace.uri.fsPath, item.rootDir);
    return relative || workspace.name;
}
async function scanRoots(resource) {
    const configuration = vscode.workspace.getConfiguration("runready");
    const maxDepth = configuration.get("scanDepth", 6);
    let roots = [];
    if (resource?.scheme === "file") {
        try {
            const stat = await node_fs_1.promises.stat(resource.fsPath);
            roots = [stat.isDirectory() ? resource.fsPath : path.dirname(resource.fsPath)];
        }
        catch {
            roots = [resource.fsPath];
        }
    }
    else {
        roots = (vscode.workspace.workspaceFolders ?? [])
            .filter((folder) => folder.uri.scheme === "file")
            .map((folder) => folder.uri.fsPath);
    }
    if (roots.length === 0) {
        void vscode.window.showErrorMessage("RunReady needs an open local folder to inspect.");
        return [];
    }
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: "RunReady: detecting runnable projects",
    }, async () => (await Promise.all(roots.map((root) => (0, analyzer_1.analyzeWorkspace)(root, maxDepth)))).flat());
}
async function pickCandidate(resource) {
    const candidates = await scanRoots(resource);
    if (candidates.length === 0) {
        void vscode.window.showWarningMessage("RunReady could not find a verified run command here. Open the folder containing the project's manifest or entry file.");
        return undefined;
    }
    let selectableCandidates = candidates;
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri?.scheme === "file") {
        const matches = candidates
            .filter((item) => {
            const relative = path.relative(item.rootDir, activeUri.fsPath);
            return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
            })
            .sort((left, right) => right.rootDir.length - left.rootDir.length);
        if (matches.length > 0) {
            const deepestRoot = path.resolve(matches[0].rootDir);
            const deepestMatches = matches.filter((item) => path.resolve(item.rootDir) === deepestRoot);
            if (deepestMatches.length === 1)
                return deepestMatches[0];
            selectableCandidates = deepestMatches;
        }
    }
    if (selectableCandidates.length === 1)
        return selectableCandidates[0];
    const items = selectableCandidates.map((item) => {
        const dependencyState = statePresentation[item.dependencies.state];
        return {
            label: `$(play) ${item.name}`,
            description: `${item.projectType} • ${candidateLocation(item)}`,
            detail: `${dependencyState.icon} ${dependencyState.label} — ${item.runChoices[0].command}`,
            candidate: item,
        };
    });
    const selected = await vscode.window.showQuickPick(items, {
        title: "RunReady: select a project",
        placeHolder: "Projects are ordered from the workspace root outward",
        matchOnDescription: true,
        matchOnDetail: true,
    });
    return selected?.candidate;
}
async function pickRunChoice(candidate) {
    if (candidate.runChoices.length === 1)
        return candidate.runChoices[0];
    const dependencyState = statePresentation[candidate.dependencies.state];
    const items = candidate.runChoices.map((item) => ({
        label: item.recommended ? `$(star-full) ${item.label}` : `$(terminal) ${item.label}`,
        description: item.command,
        detail: item.url ? `${item.description} - opens at ${item.url}` : item.description,
        choice: item,
    }));
    return (await vscode.window.showQuickPick(items, {
        title: `RunReady: how should ${candidate.name} run? - ${dependencyState.label}`,
        placeHolder: `${candidate.dependencies.summary} The starred command is the strongest match.`,
        matchOnDescription: true,
        matchOnDetail: true,
    }))?.choice;
}
function makePlan(candidate, runChoice) {
    const configuration = vscode.workspace.getConfiguration("runready");
    const configuredShell = configuration.get("shellStyle", "auto");
    const includeInstall = configuration.get("includeDependencyInstall", true);
    let shellStyle = (0, shell_1.resolveShellStyle)(configuredShell);
    if (configuredShell === "auto") {
        const terminalConfig = vscode.workspace.getConfiguration("terminal.integrated");
        const profileKey = process.platform === "win32"
            ? "defaultProfile.windows"
            : process.platform === "darwin"
                ? "defaultProfile.osx"
                : "defaultProfile.linux";
        const configuredProfile = terminalConfig.get(profileKey);
        const profile = typeof configuredProfile === "string" ? configuredProfile.toLowerCase() : "";
        if (profile.includes("bash") ||
            profile.includes("zsh") ||
            profile.includes("fish") ||
            profile.includes("wsl")) {
            shellStyle = "bash";
        }
        else if (profile.includes("command prompt") || profile === "cmd") {
            shellStyle = "cmd";
        }
        else if (profile.includes("powershell") || profile.includes("pwsh")) {
            shellStyle = "powershell";
        }
    }
    return (0, shell_1.createCommandPlan)(candidate, runChoice, shellStyle, includeInstall);
}
async function buildSelectedPlan(resource) {
    const selected = await pickCandidate(resource);
    if (!selected)
        return undefined;
    const runChoice = await pickRunChoice(selected);
    if (!runChoice)
        return undefined;
    return makePlan(selected, runChoice);
}
function writeDetails(plan) {
    const { candidate } = plan;
    const dependencyState = statePresentation[candidate.dependencies.state];
    output.clear();
    output.appendLine(`RunReady analysis: ${candidate.name}`);
    output.appendLine("=".repeat(72));
    output.appendLine(`Project type: ${candidate.projectType}`);
    output.appendLine(`Directory:    ${candidate.rootDir}`);
    output.appendLine(`Detected from: ${candidate.markerFile}`);
    output.appendLine(`Confidence:   ${candidate.confidence}`);
    output.appendLine(`Dependencies: ${dependencyState.label}`);
    output.appendLine(`               ${candidate.dependencies.summary}`);
    for (const detail of candidate.dependencies.details) {
        output.appendLine(`               - ${detail}`);
    }
    output.appendLine("");
    output.appendLine("Why this command:");
    for (const evidence of candidate.evidence) {
        output.appendLine(`- ${evidence}`);
    }
    output.appendLine("");
    output.appendLine("Exact terminal command:");
    output.appendLine(plan.fullCommand);
    output.appendLine("");
    output.appendLine("Command sequence:");
    output.appendLine(`1. Change directory to ${candidate.rootDir}`);
    plan.commands.forEach((command, index) => output.appendLine(`${index + 2}. ${command}`));
    output.show(true);
}
async function pickAction(plan) {
    const dependencyState = statePresentation[plan.candidate.dependencies.state];
    const selected = await vscode.window.showQuickPick([
        {
            label: "$(terminal) Fill in Terminal",
            description: "Recommended — review it, then press Enter",
            detail: plan.fullCommand,
            action: "fill",
        },
        {
            label: "$(play) Run Now",
            description: "Execute the complete command immediately",
            detail: `${dependencyState.icon} ${dependencyState.label}`,
            action: "run",
        },
        {
            label: "$(copy) Copy Command",
            description: "Copy the cd, setup, and run command",
            detail: plan.fullCommand,
            action: "copy",
        },
        {
            label: "$(output) Show Analysis",
            description: "See dependency details and detection evidence",
            action: "details",
        },
    ], {
        title: `${plan.candidate.name} — ${dependencyState.label}`,
        placeHolder: plan.candidate.dependencies.summary,
        matchOnDescription: true,
        matchOnDetail: true,
    });
    return selected?.action;
}
function createProjectTerminal(plan) {
    if (vscode.window.activeTerminal) {
        return vscode.window.activeTerminal;
    }
    const workspace = containingWorkspace(plan.candidate.rootDir);
    return vscode.window.createTerminal({
        name: `RunReady: ${plan.candidate.name}`,
        cwd: workspace?.uri ?? vscode.Uri.file(plan.candidate.rootDir),
    });
}
async function performAction(plan, action) {
    if (action === "details") {
        writeDetails(plan);
        return;
    }
    if (action === "copy") {
        await vscode.env.clipboard.writeText(plan.fullCommand);
        void vscode.window.showInformationMessage("RunReady copied the complete command.");
        return;
    }
    if (!vscode.workspace.isTrusted) {
        await vscode.env.clipboard.writeText(plan.fullCommand);
        void vscode.window.showWarningMessage("Restricted Mode prevents RunReady from sending commands to a terminal. The command was copied instead.");
        return;
    }
    if (action === "fill") {
        await vscode.env.clipboard.writeText(plan.fullCommand);
        const terminal = createProjectTerminal(plan);
        terminal.show(false);
        terminal.sendText(plan.fullCommand, false);
        const dependencyState = statePresentation[plan.candidate.dependencies.state];
        const urlHint = plan.choice.url ? ` After it starts, open ${plan.choice.url}.` : "";
        const actions = plan.choice.url ? ["Open URL", "Copy URL"] : [];
        const selected = await vscode.window.showInformationMessage(`RunReady filled and copied the command. ${dependencyState.label}: ${plan.candidate.dependencies.summary} Press Enter when you are ready to run it.${urlHint}`, ...actions);
        if (selected === "Open URL")
            await vscode.env.openExternal(vscode.Uri.parse(plan.choice.url));
        else if (selected === "Copy URL")
            await vscode.env.clipboard.writeText(plan.choice.url);
        return;
    }
    const confirmation = await vscode.window.showWarningMessage(`Run this command now? ${plan.fullCommand}`, { modal: true, detail: "Project scripts can execute arbitrary code. Only continue if you trust this workspace." }, "Run Command");
    if (confirmation === "Run Command") {
        const terminal = createProjectTerminal(plan);
        terminal.show(false);
        terminal.sendText(plan.fullCommand, true);
    }
}
async function findAndRun(resource) {
    try {
        const plan = await buildSelectedPlan(resource);
        if (!plan)
            return;
        await performAction(plan, "fill");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`[error] ${new Date().toISOString()} ${message}`);
        if (error instanceof Error && error.stack)
            output.appendLine(error.stack);
        const action = await vscode.window.showErrorMessage(`RunReady could not prepare the command: ${message}`, "Show RunReady Log");
        if (action === "Show RunReady Log")
            output.show(true);
    }
}
async function inspectProject(resource) {
    const plan = await buildSelectedPlan(resource);
    if (plan)
        writeDetails(plan);
}
function activate(context) {
    output = vscode.window.createOutputChannel("RunReady");
    const status = vscode.window.createStatusBarItem("runready.statusButton.v2", vscode.StatusBarAlignment.Left, 10000);
    status.name = "RunReady";
    status.text = "$(rocket) RunReady";
    status.tooltip = "Detect the correct command to run this project";
    status.command = "runready.findAndRun";
    status.show();
    context.subscriptions.push(output, status, vscode.commands.registerCommand("runready.findAndRun", findAndRun), vscode.commands.registerCommand("runready.inspectProject", inspectProject), vscode.commands.registerCommand("runready.showStatusButton", () => {
        status.show();
        void vscode.window.showInformationMessage("RunReady is pinned to the status bar.");
    }));
}
function deactivate() {
    // VS Code disposes subscriptions registered in the extension context.
}
//# sourceMappingURL=extension.js.map
