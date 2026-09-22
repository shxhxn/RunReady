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
exports.resolveShellStyle = resolveShellStyle;
exports.cdCommand = cdCommand;
exports.chainCommands = chainCommands;
exports.commandForShell = commandForShell;
exports.createCommandPlan = createCommandPlan;
const path = __importStar(require("node:path"));
function resolveShellStyle(configured, platform = process.platform) {
    if (configured !== "auto") {
        return configured;
    }
    return platform === "win32" ? "powershell" : "bash";
}
function quotePowerShell(value) {
    return `'${value.replace(/'/g, "''")}'`;
}
function quotePosix(value) {
    return `'${value.replace(/'/g, `'"'"'`)}'`;
}
function quoteCmd(value) {
    return `"${value.replace(/"/g, '""')}"`;
}
function cdCommand(directory, shellStyle) {
    const normalized = path.normalize(directory);
    switch (shellStyle) {
        case "powershell":
            return `Set-Location -LiteralPath ${quotePowerShell(normalized)}`;
        case "cmd":
            return `cd /d ${quoteCmd(normalized)}`;
        case "bash":
            return `cd ${quotePosix(normalized.replace(/\\/g, "/"))}`;
    }
}
function chainPowerShell(cd, commands) {
    if (commands.length === 0) {
        return cd;
    }
    let nested = commands[commands.length - 1];
    for (let index = commands.length - 2; index >= 0; index -= 1) {
        nested = `${commands[index]}; if ($LASTEXITCODE -eq 0) { ${nested} }`;
    }
    return `${cd}; if ($?) { ${nested} }`;
}
function chainCommands(directory, commands, shellStyle) {
    const cd = cdCommand(directory, shellStyle);
    if (shellStyle === "powershell") {
        return chainPowerShell(cd, commands);
    }
    return [cd, ...commands].join(" && ");
}
function commandForShell(command, shellStyle, platform = process.platform) {
    if (platform !== "win32" || shellStyle !== "powershell") {
        return command;
    }
    return command.replace(/^(npm|npx|pnpm|yarn|corepack|code)(?=\s)/, (executable) => `${executable}.cmd`);
}
function pythonActivationCommand(environmentName, shellStyle) {
    switch (shellStyle) {
        case "powershell":
            return `try { $runreadyVenv = (Resolve-Path -LiteralPath '${environmentName.replace(/'/g, "''")}' -ErrorAction Stop).Path; if ($env:VIRTUAL_ENV -ne $runreadyVenv) { $env:VIRTUAL_ENV = $runreadyVenv; $env:PATH = "$runreadyVenv\\Scripts;$env:PATH" }; $global:LASTEXITCODE = 0 } catch { Write-Error $_; $global:LASTEXITCODE = 1 }`;
        case "bash":
            return `runready_venv="$(pwd)/${environmentName.replace(/"/g, '\\"')}"; if [ "\${VIRTUAL_ENV:-}" != "$runready_venv" ]; then export VIRTUAL_ENV="$runready_venv"; export PATH="$runready_venv/bin:$PATH"; fi`;
        case "cmd":
            return `if /I not "%VIRTUAL_ENV%"=="%CD%\\${environmentName.replace(/"/g, '""')}" (set "VIRTUAL_ENV=%CD%\\${environmentName.replace(/"/g, '""')}" & set "PATH=%CD%\\${environmentName.replace(/"/g, '""')}\\Scripts;%PATH%")`;
    }
}
function createCommandPlan(candidate, choice, shellStyle, includeDependencyInstall) {
    const setupCommands = includeDependencyInstall &&
        (candidate.dependencies.state === "missing" || candidate.dependencies.state === "unknown")
        ? candidate.dependencies.setupCommands
        : [];
    const activationCommands = typeof candidate.pythonEnvironment === "string"
        ? [pythonActivationCommand(candidate.pythonEnvironment, shellStyle)]
        : [];
    const commands = [...setupCommands, ...activationCommands, ...(choice.commandSequence ?? [choice.command])].map((command) => commandForShell(command, shellStyle));
    return {
        candidate,
        choice,
        shellStyle,
        commands,
        fullCommand: chainCommands(candidate.rootDir, commands, shellStyle),
    };
}
//# sourceMappingURL=shell.js.map
