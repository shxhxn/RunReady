# Contributing to RunReady

Bug reports and detector improvements are welcome.

## Local checks

```powershell
npm install
npm test
npm run package
```

Install the generated VSIX in a VS Code test profile before opening a pull request.

When adding a detector, require concrete project evidence such as a manifest, framework dependency, declared script, or conventional entry file. RunReady should say that it is uncertain instead of inventing a command.

