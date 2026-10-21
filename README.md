# 目标进展图 / Goal Map

一眼查看目标、AI 做到哪里，以及计划中还差哪些步骤。为 DeepSeek Harness Web 提供只读的目标进展路线、思维导图和步骤列表。

**0.2.0-beta.1 · 已公开源码。** 包名为 `dsh-plugin-goal-map`，作者为 **sensenzi**，采用 **MIT** 许可，Copyright (c) 2026 sensenzi。完整授权见 [LICENSE](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/LICENSE>)。源码已公开到 GitHub，[1024 Store 社区市场条目](https://deepseek1024.com/plugins/sensen-jo/dsh-plugin-goal-map) 已实际可见，[PR #657](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pull/657) 已通过静态检查并合并；npm beta 发行候选使用固定版本 `dsh-plugin-goal-map@0.2.0-beta.1`；可先核对 [npm 版本记录](https://www.npmjs.com/package/dsh-plugin-goal-map/v/0.2.0-beta.1)，市场安装标签可能延迟同步。静态收录不代表插件运行验收。

- 公开仓库：[sensen-jo/dsh-plugin-goal-map](https://github.com/sensen-jo/dsh-plugin-goal-map)。
- 问题反馈：[GitHub Issues](https://github.com/sensen-jo/dsh-plugin-goal-map/issues)。可在仓库 Issues 描述问题，避免公开真实会话或敏感目标文本。
- 仅声明已验证的 **DSH Web 0.2.0-rc.2**；构建与测试需要 **Node.js >=24**。

## 能看到什么

- **你的要求 → AI 做到这里 → 距离目标还差**：显示正式目标摘要、已报告完成/当前进行中的步骤和全部未完成项，保留原编号并可打开详情。
- **进度条和完成项数**：例如 `33% · 已报告 1/3 项`。收起路线后仍保留进度与必要的状态核对信息。
- **目标全景图**：目标根节点连到计划、工具活动和直接子代理三个分组；展开查看保留节点，也可切换完整步骤列表。
- **快速定位**：查找、定位当前、多项进行中查看全部、键盘展开和详情焦点回退。重复打开同一节点会重新定位详情。
- **手机尺寸与深色界面**：根据实际会话栏宽度排列，使用宿主自然滚动，支持 75–150% 字号。

## 展示 / Screenshots

以下三张图复制自更名前 **alpha7 功能基线的合成示例，非真实会话，也不是新拍摄的 beta.1 截图**。候选界面仍使用“流程图 / 会话流程”标签。它们说明视图行为，不表示已上架、真人验收或原生手机应用兼容。

### 桌面 / Desktop

![合成旅行计划路线：三项计划中一项报告完成，显示33%的等权计划进度](<https://raw.githubusercontent.com/sensen-jo/dsh-plugin-goal-map/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/docs/desktop.png>)

[查看桌面图](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/docs/desktop.png>)：把目标、已报告进展和剩余事项放在一起。33% 按计划项等权计算，不代表目标验收。Synthetic alpha7 desktop example: equal-weight declared plan progress, not goal acceptance.

### 手机尺寸 / Phone-size layout

![390像素宽的合成旅行计划：路线随窄会话栏纵向排列](<https://raw.githubusercontent.com/sensen-jo/dsh-plugin-goal-map/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/docs/mobile.png>)

[查看手机尺寸图](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/docs/mobile.png>)：Chromium 窄栏布局采用页面自然滚动，不声明其他浏览器或手机应用已验证。Synthetic alpha7 phone-size example: the route stacks vertically and uses normal page scrolling.

### 完成标记核对 / Completion reconciliation

![合成总览：目标已标完成但仍有两项计划未完成，路线收起后保留核对提示](<https://raw.githubusercontent.com/sensen-jo/dsh-plugin-goal-map/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/docs/reconcile.png>)

[查看核对图](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/docs/reconcile.png>)：路线收起后，目标完成标记与未完成计划的冲突仍可见。图中下方分支可继续自然滚动查看，并非完整展开全图。Synthetic alpha7 example: unfinished plan items remain visible for review even when the route is collapsed.

## 进度怎么算

仅在完整、当前、已同步且有效的计划上，按 `floor(已报告完成项数 / 总项数 × 100)` 计算，每项等权。计划新增时百分比可能下降。工具返回、子代理结束不会推进计划进度。

**100% 表示计划项已报告完成；是否满足你的全部要求仍需核对。** 不估计工作量或剩余时间。没有计划、历史快照、未同步、无效或截断计划不显示百分比。正式目标标完成但仍有未完计划时提示核对；没有正式目标时明确使用会话标题参考。

## 安装和使用

npm beta 发行候选采用固定版本。确认 [npm 版本记录](https://www.npmjs.com/package/dsh-plugin-goal-map/v/0.2.0-beta.1) 已存在后，可在兼容 DSH 的 **插件 → 添加插件** 中填写 `dsh-plugin-goal-map@0.2.0-beta.1`，或运行：

```sh
dsh plugin --profile web add dsh-plugin-goal-map@0.2.0-beta.1
```

也可从仓库 **Code → Download ZIP** 下载解压，或使用经核对的 tarball。请固定版本，不把 beta 版视为所有宿主兼容。

1. 使用上述 npm 固定版本，或打开解压后的完整源码目录、使用经核对的 tarball。仓库根目录即插件包根目录，包含 [插件入口](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/index.mjs>)、[bundle 补丁](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/cordis.patch.yml>) 和 [预构建客户端](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/lib/client.js>)，不需要寻找内部子目录。
2. 在 DSH 的 **插件 → 添加插件** 中填写上述 npm 包规格，或本地目录、tarball 的绝对路径，按宿主提示启用并刷新页面。
3. 进入一个非空会话顶部的 **流程图 → 总览图**，也可使用 **步骤列表**。当前界面使用中文标签。

已核公开 main 首提交 ZIP 的全部 32 个文件与审阅源码一致；同版本 27 文件 tarball 经隔离安装、禁用和卸载验证。Git clone 来源安装尚未实测；npm 固定版本的远端可用性以 registry 记录为准。DSH 支持 npm、Git 来源、tarball 与本地目录，具体权限由宿主管理。

已有开发版会话流程图时，先在插件页禁用旧开发 bundle，再启用本包；两者复用同一视图目标，不应同时启用。禁用/卸载在插件页完成。插件不会删除聊天或保存自己的业务数据。升级遵循宿主插件管理流程，不承诺自动更新。

“刷新状态”只重读公开元数据，不会运行下一步或重试工具。需要回复或确认时请回到对话处理。

## 数据和权限

只使用宿主已公开的 Goal/Todo 投影、已加载工具生命周期以及直接子代理目录/状态。默认不读取聊天、推理、工具参数/返回正文、私有文件或凭据；不调用模型、执行任务、启动子代理、遥测、上传、添加定时或持久化数据。刷新通过宿主已有元数据服务完成。

正式目标/计划、会话标题和子代理名称本身可能包含敏感文本；本插件不自动脱敏。详见 [隐私说明](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/PRIVACY.md>)。公开仓库中的三张展示图均为合成示例；npm 文件白名单排除整个展示图目录。

## 兼容与限制

验证限 **DSH Web 0.2.0-rc.2、宿主 React 18.3.1、Chromium**。DSH peer 保持精确版本且为可选依赖，避免另装宿主。其他 DSH 版本、桌面变体或浏览器尚未验证，见 [兼容说明](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/COMPATIBILITY.md>)。

最多保留 600 个进展事件、32 个工具节点、80 个计划项和 48 个直接子代理。图的分支表达分组、路线箭头表达阅读顺序，不推断执行依赖或工具归属。查找仅涵盖保留节点，不会加载遗漏历史。详情工具检查委托宿主原有轨迹视图。

功能基线经源码、实际 SDK 合成会话、宽窄栏/深色/放大字号与离线安装生命周期验证。这些历史基线检查不替代真人登录、读屏器或生产发送验收；本次公开元数据准备也不宣称新增浏览器或宿主验证。

## 开发与后续发行

零新增运行依赖，React 由宿主提供。包自带源码、测试和可重复构建：

```sh
npm run build
npm test
npm run validate
npm run check:build
npm run check:release
npm pack --dry-run --json
```

[构建脚本](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/build.mjs>) 只生成包内客户端产物；prepack 检查不下载代码、不上传、不修改宿主 profile。`check:release` 通过表示本地包的静态发布门禁通过，不代表仓库已公开、npm 已发布或市场已收录。后续步骤见 [发布说明](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/RELEASING.md>)。

## English

Goal Map adds a read-only goal-to-plan route, session mindmap and step list to DeepSeek Harness Web. Follow the structured goal, declared completed/current steps and unfinished plan items without starting another model or scheduler. Progress measures equal-weight declared plan items, not acceptance or effort. Missing, historical, stale, invalid or truncated plans do not receive a percentage.

**Version 0.2.0-beta.1 source is public.** Package: `dsh-plugin-goal-map`. Author: **sensenzi**. License: **MIT**, Copyright (c) 2026 sensenzi; see the complete [license](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/LICENSE>). The selected repository is [sensen-jo/dsh-plugin-goal-map](https://github.com/sensen-jo/dsh-plugin-goal-map), with [issues](https://github.com/sensen-jo/dsh-plugin-goal-map/issues) available. The [1024 Store community listing](https://deepseek1024.com/plugins/sensen-jo/dsh-plugin-goal-map) is live; [catalog PR #657](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pull/657) passed static review and was merged. The npm beta release candidate uses the pinned version [`dsh-plugin-goal-map@0.2.0-beta.1`](https://www.npmjs.com/package/dsh-plugin-goal-map/v/0.2.0-beta.1); check its registry record before installation. Store installation labels may update later. Static catalog admission is not runtime acceptance. Git clone installation is not claimed tested.

After the pinned npm version is available, enter `dsh-plugin-goal-map@0.2.0-beta.1` in **Plugins → Add plugin**, or run `dsh plugin --profile web add dsh-plugin-goal-map@0.2.0-beta.1`. Alternatively, download **Code → Download ZIP** from the public repository, extract it, or obtain the reviewed tarball and add its absolute path. The repository root is the plugin root and includes its patch and built client, at the verified public source location. Enable it, refresh the page and open **流程图 → 总览图** in a non-empty session. Disable an older development Session Flow bundle first. Refresh reads metadata only; disable or uninstall through the host plugin manager.

The three linked screenshots above are copied **synthetic alpha7 examples**, not real conversations or newly captured beta.1 screenshots. They are kept in the repository for documentation and excluded from the npm allowlist. The tested scope remains **DSH Web 0.2.0-rc.2, host React 18.3.1 and Chromium**; development requires **Node.js >=24**. Other versions and browsers are unverified. Public goal/plan text and labels may contain sensitive material and are not automatically redacted. See [privacy](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/PRIVACY.md>), [compatibility](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/COMPATIBILITY.md>) and [releasing](<https://github.com/sensen-jo/dsh-plugin-goal-map/blob/a1efb6ae8e847f8daba423b47ccc6f2bd9543af9/RELEASING.md>) for the exact boundaries.
