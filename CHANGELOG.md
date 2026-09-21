# Changelog

## 0.2.1

- Simplify the Marketplace description and overview.
- Add clear before-and-after images showing the RunReady workflow.

## 0.2.0

- Prepare RunReady for its first public VS Code Marketplace release.
- Add Marketplace branding, support links, GitHub issue templates, and release instructions.
- Add repeatable package and update commands.
- Make the smoke test self-contained so it does not depend on the developer's local projects.
- Add `.runready.json` definitions for unsupported or private toolchains.

## 0.1.4

- Automatically choose the deepest detected project containing the active editor file.

## 0.1.3

- Fix a crash when VS Code's default terminal profile setting is `null`.
- Make the main RunReady button fill and copy the command without executing it.
- Reuse an open terminal or create one automatically.
- Detect Python applications with nested `backend/app/main.py` and similar layouts.
- Verify direct `requirements.txt` packages against the local virtual environment.
- Report unexpected failures through the RunReady output channel.

## 0.1.2

- Give the status item a unique ID so an older hidden state cannot suppress it.
- Show the status item unconditionally and raise its placement priority.
- Add a **RunReady: Show Status Bar Button** recovery command.

## 0.1.1

- Activate automatically after VS Code starts so the RunReady status item appears immediately.
- Add an editor-title play button as an additional entry point.
- Document how to restore VS Code's globally hidden status bar.

## 0.1.0

- Initial project detection and full command generation.
