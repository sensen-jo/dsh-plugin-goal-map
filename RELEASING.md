# Publication and release verification

Goal Map is `dsh-plugin-goal-map`, maintained by sensenzi under MIT. The public repository is [sensen-jo/dsh-plugin-goal-map](https://github.com/sensen-jo/dsh-plugin-goal-map); the package root contains the complete LICENSE, host entry, bundle patch, prebuilt client and sources. Beta.1 was published on npm. Beta.2 is the update candidate for DSH Web 0.2.1-rc.2; a candidate is not a publication receipt.

The beta.2 engine and optional host peer declare only `0.2.0-rc.2 || 0.2.1-rc.2`, with Node.js >=24. The read-only runtime model and behavior are preserved; the candidate adds a narrow-column CSS change reserving a full settings row. CSS and the built client therefore differ from beta.1; UI logic is unchanged. Browser evidence must establish horizontal stability before local installation. Earlier-host evidence covers the unchanged model and UI behavior, not an independent rerun of these patches on the old host. New-host verification is separate. Never widen a range just to suppress a warning.

## Release gates

1. Run deterministic build/check, all Node tests and `node validate-package.mjs --release`.
2. Check real installed host compatibility including rejected untested versions. Exercise actual SDK registration, projections, progress, responsive layout and disposal with synthetic data.
3. Inspect the final npm allowlist and exact tarball, scan for secrets/local paths and verify source identity, MIT and public author metadata. Keep receipts outside the public package.
4. Install the exact tarball with the official DSH CLI in a fresh DSH_HOME and isolated cache with install scripts and peer auto-install disabled. Verify all installed bytes, lock integrity, host compatibility and real Loader activation without servers/models.
5. Publish only the reviewed tarball with beta tag. Verify public version, tags and downloaded bytes before a registry installation or promoting latest. Do not repack after verification or expose authentication data.
6. Update the existing market catalog entry through an incremental pull request. npm availability, directory acceptance, website deployment and actual configured market GUI search are separate facts; none implies another.

## Privacy and provenance

Use synthetic screenshots only; do not publish private goals, chat, machine paths, tokens or test receipts. Build/test/validation do not upload or access credentials. The 27-file npm allowlist excludes Git helpers and documentation screenshots. Repository screenshot examples are historical alpha7 demonstrations, not newly captured beta.2 or authenticated-market evidence. See [PRIVACY.md](PRIVACY.md) and [COMPATIBILITY.md](COMPATIBILITY.md).
