# Compatibility

| Area | Verified scope |
|---|---|
| DSH Web 0.2.0-rc.2 | Prior beta.1 actual installed Slot/Conversation tests; unchanged model and UI behavior, but beta.2 narrow-column CSS was not rerun on this old host |
| DSH Web 0.2.1-rc.2 | beta.2 compatibility update; require new-host compatibility, installation, Loader and browser integration verification before release |
| Host React 18.3.1 | Host-supplied external, not bundled or installed by this package |
| Chromium | Historical beta.1 layout/focus evidence; beta.2 new-host matrix remains a release gate until its recorded regressions are resolved |
| Node.js >=24 | Dependency-free build, validation and tests |
| Other DSH versions, browsers or Electron variants | Not claimed compatible |

## Host contracts

- `conversation.view` scoped list slot and lifecycle disposal.
- Public `uiConversation` event definitions, builders and per-session target observable.
- Session, list, status and projection selector hooks; `connection.state`.
- `sessions.refreshProjections`, `sessions.refresh` and original `inspectCall` action.
- Actual conversation scroll ancestor and composer-seat attributes for inline details; standard DOM scrolling elsewhere.

`dsh.client.inject` lists package dependencies for module loading; exported client `inject` lists Cordis services. They are not interchangeable.

## Version policy

The engine and optional host peer both declare the finite union `0.2.0-rc.2 || 0.2.1-rc.2`, not a promise of future 0.2 releases. DSH 0.2.1-rc.2 evaluates an own `engines.dsh` before DSH peers. The earlier host checked peers, so both fields remain explicit. The optional peer prevents npm from installing a second host. Do not grant a version exemption or bypass incompatibility warnings.

## Verification boundary

The integration harness exercises real installed SDK implementations using synthetic public sources. Minimal documented lifecycle/store/composer seams are not production transport or a second full host. Isolated official CLI installation and real Cordis Loader checks are distinct from authenticated GUI acceptance. No claim is made about every third-party combination, persisted conversations, Lexical upload/send, or untested host versions. The final release must retain separate evidence for the exact packed artifact.
