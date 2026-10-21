# Compatibility

| Area | Status |
|---|---|
| DSH Web 0.2.0-rc.2 | Tested interfaces and actual installed Slot/Conversation implementation with synthetic sources |
| Host React 18.3.1 | Tested; external supplied by the host, not bundled or installed |
| Chromium | Tested responsive layouts, interactions and focus behavior |
| Node.js >=24 | Dependency-free build, validation and tests |
| Other DSH prereleases/releases | Not claimed compatible |
| Other browsers / Electron variants | Not yet certified |

## Host contracts used

- `conversation.view` scoped list slot and slot lifecycle disposal.
- Public `uiConversation` event definitions/builders and per-session target observable.
- Standard session/session-list/session-status/projection selector hooks.
- `connection.state` observable.
- `sessions.refreshProjections` and `sessions.refresh`; original `inspectCall` owner action.
- Actual Conversation scroll ancestor and composer-seat attributes for revealing inline details inside the readable area. Outside that container, standard DOM scrolling is the fallback.

`dsh.client.inject` lists package dependencies for module loading; exported client `inject` lists Cordis service requirements. These are not interchangeable.

## Version policy

The manifest declares the exact tested host version, rather than promising all future 0.2 or 1.x versions. Installed DSH 0.2.0-rc.2 checks **DSH peer dependencies**, not `engines.dsh`, and includes prereleases when evaluating ranges. This package therefore declares an exact `@deepseek-ai/dsh` peer as well as `engines.dsh`. The peer is optional for npm dependency installation (the host is supplied by DSH), but the tested host compatibility evaluator still checks it. Newer official source/documentation may prioritize `engines.dsh`; that is not evidence about this installed version. Do not bypass an incompatibility warning. A broader range needs real version-matrix evidence.

## Verification boundary

The integration harness executes actual installed SlotCore/SlotRegistry/renderer/ConversationRoot/content Factory and assembler. Public sources, Cordis effects/store and composer-bar have documented synthetic seams. This proves those registration/layout contracts, not authenticated GUI, production transport, persistence, Lexical send/upload, queues or every third-party plugin combination.
