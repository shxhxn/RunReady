# RunReady

RunReady detects how a project runs, checks whether its dependencies look ready, and prepares one complete `cd -> install -> run` terminal command.

Click **RunReady** in the status bar, use **RunReady: Find and Run Project** from the Command Palette, click the editor-title play button, or right-click a project folder in Explorer.

RunReady uses the active file to choose the most relevant project, opens or reuses the integrated terminal, fills the command without executing it, and copies the same command to the clipboard. Review it, then press Enter yourself.

## Built-in project support

- Node.js and package scripts using npm, pnpm, Yarn, or Bun.
- React, Vite, Next.js, Nuxt, SvelteKit, Astro, Angular, Electron, Express, and VS Code extensions.
- Python, FastAPI, Flask, and Django, including common nested backend layouts.
- Rust/Cargo, Go, Java/Maven, Java/Gradle, .NET and F#.
- Flutter/Dart, PHP/Composer/Laravel, Ruby/Bundler/Rails.
- Docker Compose, C/C++ with CMake, and static websites.

Detection is evidence-based. RunReady does not claim that one heuristic can understand every repository, and it will avoid inventing a command when the evidence is weak.

## Unsupported or private toolchains

Add a `.runready.json` file to a project root:

```json
{
  "name": "My worker",
  "projectType": "Private toolchain",
  "command": "acme-worker serve",
  "setupCommands": ["acme-worker install"],
  "dependencyState": "unknown"
}
```

`dependencyState` can be `ready`, `missing`, `managed`, or `unknown`. Custom setup commands are included when the state is `missing` or `unknown` and **RunReady: Include Dependency Install** is enabled.

For multiple choices, replace `command` with:

```json
{
  "commands": [
    { "label": "Development server", "command": "acme dev", "recommended": true },
    { "label": "Production mode", "command": "acme start" }
  ]
}
```

## Dependency checks

For Node projects, RunReady verifies directly declared packages in `node_modules`, including hoisted workspace packages. For Python projects, it compares direct requirements with installed distribution metadata in `.venv` or `venv`. Ecosystems such as Cargo, Go, Maven, and Gradle resolve dependencies through their own runners.

## Privacy and safety

RunReady works locally and does not send project data to an AI service. It fills commands without executing them. Project scripts can still run arbitrary code, so review the command before pressing Enter.

If the status bar is hidden, enable **View > Appearance > Status Bar**. You can also run **RunReady: Show Status Bar Button**.

## Feedback and author

Report a wrong or missing command through [GitHub Issues](https://github.com/shxhxn/RunReady/issues). See the [support guide](SUPPORT.md) for the details that make a report useful.

Created by Shahan Samar — [GitHub](https://github.com/shxhxn) · [LinkedIn](https://www.linkedin.com/in/shahan-samar-603063371/)
