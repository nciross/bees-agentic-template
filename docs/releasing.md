# Releasing

bees is published to npm as [`bees-agentic`](https://www.npmjs.com/package/bees-agentic).
Publishing is automatic: pushing a `v*` tag runs [`.github/workflows/release.yml`](../.github/workflows/release.yml),
which tests, publishes to npm with provenance, and creates a GitHub Release with generated notes.

## Cut a release

From an up-to-date `main`:

```bash
npm version prerelease --preid alpha   # 0.1.0-alpha.0 -> 0.1.0-alpha.1
# or: npm version patch | minor | major
git push --follow-tags
```

`npm version` bumps `package.json`, commits and tags `vX.Y.Z`; the push triggers the workflow.

| Version            | npm dist-tag | Installed by                  |
| ------------------ | ------------ | ----------------------------- |
| `0.2.0-alpha.1`    | `alpha`      | `npx bees-agentic@alpha`      |
| `0.2.0-beta.0`     | `beta`       | `npx bees-agentic@beta`       |
| `0.2.0`            | `latest`     | `npx bees-agentic`            |

The workflow fails if the tag does not match the `package.json` version.

## One-time setup

1. **First publish.** npm only lets you configure trusted publishing on a package that already exists, so either:
   - publish once by hand: `npm login`, then `npm publish --tag alpha --access public`; or
   - create a granular **automation** token on npmjs.com and save it as the `NPM_TOKEN` repository secret, then push a tag.
2. **Trusted publishing.** On npmjs.com → `bees-agentic` → *Settings* → *Trusted Publisher*, add GitHub Actions with
   owner `nciross`, repository `bees-agentic-template`, workflow `release.yml`, environment `npm`.
3. **Lock it down.** Delete the `NPM_TOKEN` secret (if you created one) and, in the package settings, set
   *Publishing access* to "Require two-factor authentication and disallow tokens".
4. **(Optional)** In GitHub → *Settings* → *Environments* → `npm`, add required reviewers or restrict it to `v*` tags.
