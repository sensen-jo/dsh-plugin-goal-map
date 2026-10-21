# Publication preparation

Goal Map `0.2.0-beta.1` (`dsh-plugin-goal-map`) is **prepared for publication, not yet published**. Author: **sensenzi**. The selected public license is **MIT**, Copyright (c) 2026 sensenzi; its complete grant and disclaimer are in [LICENSE](<LICENSE>). The package declares `private:false` and explicitly includes that license in its 27-file npm allowlist.

Selected repository: [sensen-jo/dsh-plugin-goal-map](https://github.com/sensen-jo/dsh-plugin-goal-map). Selected issue destination: [GitHub Issues](https://github.com/sensen-jo/dsh-plugin-goal-map/issues). These are publication destinations; the repository contents and installation URL have not yet been published or verified. No npm publication or marketplace acceptance is claimed.

## Local preparation

The repository root is the plugin package root. It includes [package metadata](<package.json>), the [host entry](<index.mjs>), [bundle patch](<cordis.patch.yml>), [built client](<lib/client.js>), source, tests and documentation. It can be used as a local-directory bundle without moving files. A future Git source must resolve to this same root.

Run the dependency-free build, build check, Node tests, local validation and `npm run check:release`. A successful release check means static package metadata, license presence, source boundaries and built outputs passed. It does not check remote ownership, registry name availability, Git access, a live host installation or market indexing.

The release-gate tests cover complete public metadata and real relocated packages with missing license metadata, missing full license text, missing author, missing repository and `private:true`. Relocated builds copy all non-client entries from the explicit allowlist, including [LICENSE](<LICENSE>).

## Before publication

1. Check the final package identity, registry name availability and repository control in the owner's trusted publication environment.
2. Review the final inventory and runtime hashes; retain the exact DSH `0.2.0-rc.2` engine and optional peer. Complete any separately required host/install review against that exact final candidate.
3. Publish the reviewed repository contents at the selected GitHub destination, verify the repository root bundle installation, then add a confirmed Git URL installation instruction to the [README](<README.md>).
4. If distributing through npm, inspect the actual pack result and publish the reviewed `0.2.0-beta.1` artifact with the `beta` tag. The explicit allowlist excludes the screenshot directory and Git helper files.
5. Follow the selected market's actual submission/manifest rules. Verify publication receipts and a listing URL separately; an installable package alone does not establish market acceptance.

The candidate has no uploader, credential access, remote push, postinstall downloader or automatic release workflow. No publication command is run by build, tests or validation. Only the tested DSH Web interfaces are declared compatible; newer market documentation does not establish newer-host compatibility.

## Showcase provenance and acceptance limits

[Desktop](<docs/desktop.png>), [phone-size](<docs/mobile.png>) and [reconciliation](<docs/reconcile.png>) images are copied synthetic **alpha7 feature-baseline** examples. They are not newly captured beta.1 screenshots, real sessions, marketplace screenshots or human acceptance. Repository documentation retains their captions; npm excludes the image directory. Authenticated GUI, screen-reader, production transport and other-browser acceptance remain separate.
