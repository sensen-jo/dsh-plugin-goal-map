# Privacy and authority boundaries

## Reads

- Formal Goal/Todo projections and the selected session's public lifecycle/status.
- A whitelist of already-loaded progress events: turn/step start/end, explicit Todo writes, tool call/return and parallel dispatch lifecycle.
- Direct child catalog plus status/timing already visible in public sources. Unknown stays unknown; no child chat retain/open is requested.

Default extraction reads only bounded identifiers/names, sequence/time, formal plan content/status, tool return's call ID, isError and a closed list of error codes. It does not traverse arbitrary returned error messages.

## Does not read

Assistant/reasoning/message bodies, hidden chain of thought, user message bodies, tool arguments, descriptions derived from arguments, result bodies, private files, credentials, cookies or other workspaces' transcripts. An optional model helper can extract a bounded caller-approved tool description, but the shipped UI does not enable it.

## Does not do

No external network/telemetry/CDN, model invocation, task execution/retry, background timer/schedule, automatic child launch/open, export/upload or persistent plugin storage. Refresh requests only public metadata through existing host services. Tool inspection delegates to the existing host trajectory view.

## What is not a guarantee

Formal plan/goal text, session titles, child labels and tool names may themselves contain sensitive or user-authored material. The plugin does not redact that text, verify its truth, or turn Agent statements into human acceptance. The host already possesses the event history; this plugin's bounded derived snapshot does not bound the host's own memory or IO.

Text is rendered as React text, not HTML. Styles and icon are local. The explicit npm allowlist excludes machine-specific receipts, profiles, screenshots, chat data and credentials. The public repository includes three clearly captioned synthetic alpha7 showcase images in its documentation directory; they contain no real conversation and are not new beta.1 captures. Tests use synthetic fixtures only.

## Security reporting

Author: **sensenzi**. The public repository is [sensen-jo/dsh-plugin-goal-map](https://github.com/sensen-jo/dsh-plugin-goal-map), and the public [issue destination](https://github.com/sensen-jo/dsh-plugin-goal-map/issues) is available. Beta.1 was published; beta.2 is the compatibility update candidate. npm publication and marketplace deployment are verified separately. Do not place credentials, private transcripts or sensitive vulnerability details in a public issue. No private security inbox is promised by this package. See [LICENSE](<LICENSE>) for the MIT grant.
