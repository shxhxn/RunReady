# Publishing RunReady

Never commit a Marketplace token or paste one into an issue, chat, terminal history, or source file.

## First release

1. Create the `shxhxn` publisher at the [Visual Studio Marketplace publisher portal](https://marketplace.visualstudio.com/manage/publishers/). The publisher ID cannot be changed after creation.
2. Run `npm install` and `npm test`.
3. Run `npm run package` and install the generated VSIX in a clean VS Code profile.
4. Authenticate with the Marketplace using the current method in the official VS Code publishing guide.
5. Run `npx vsce publish` or upload the VSIX manually in the publisher portal.

## Updates

For a backwards-compatible bug fix:

```powershell
npm test
npm run publish:patch
```

For a feature release:

```powershell
npm test
npm run publish:minor
```

The publish command increments `package.json`, publishes the new version, and, in a Git repository, creates a version commit and tag. Push the commit and tag to GitHub after verifying the release.

Use release versions `0.2.x`, `0.4.x`, and so on. If pre-releases are added later, use odd minor versions such as `0.3.x`, as recommended by the VS Code documentation.

