# 目标进展图 / Goal Map

一眼查看你的目标、AI已报告做到哪里，以及当前计划还剩哪些步骤。为 DeepSeek Harness Web 提供只读的目标进展路线、思维导图和步骤列表。

**0.2.0-beta.2 compatibility candidate** · `dsh-plugin-goal-map` · sensenzi · MIT。Beta.1已发布；beta.2用于适配DSH Web `0.2.1-rc.2`。候选不等于已发布，请先核对[npm版本记录](https://www.npmjs.com/package/dsh-plugin-goal-map/v/0.2.0-beta.2)。插件市场搜索、审核、下载入口与npm发布是独立状态。

- [公开仓库](https://github.com/sensen-jo/dsh-plugin-goal-map) · [问题反馈](https://github.com/sensen-jo/dsh-plugin-goal-map/issues) · [MIT许可](LICENSE)
- 本版仅声明DSH Web `0.2.0-rc.2 || 0.2.1-rc.2`，Node.js >=24。保留beta.1只读模型，窄栏设置布局增加预留整行的候选修改；本版需独立SDK、安装、Loader和浏览器验证。其他版本不承诺兼容。

## 能看到什么

- **你的要求 → AI做到这里 → 距离目标还差**：正式目标、当前及已报告完成步骤、所有保留的未完成计划项，保留编号并可打开详情。
- **进度条和项数**：例如“33% · 已报告1/3项”。路线收起后仍保留状态核对信息。
- **目标全景图**：目标连接计划、工具活动、直接子代理三个分组；也可切换完整步骤列表。
- **查找与定位**：查找节点、定位当前、多项进行中查看全部、键盘展开、重复打开详情和焦点返回。
- **窄栏和深色界面**：使用宿主自然滚动，适应手机尺寸布局及75–150%字号。

## 进度不等于验收

仅在完整、当前、已同步且有效的计划上，按 `floor(已报告完成项数 / 总项数 × 100)` 计数，每项等权。新增计划时百分比可能下降。工具返回、子代理结束不推进百分比；没有计划、历史、未同步、无效或截断计划不显示百分比。

**100%表示计划项已报告完成，不证明你的全部要求已经满足。** 不估计工作量和剩余时间，也不自动发现遗漏要求。正式目标已完成但仍有未完计划时提示核对；没有正式目标时明确使用会话标题参考。

## 安装与使用

确认版本已公开且宿主兼容后，在插件添加入口填写 `dsh-plugin-goal-map@0.2.0-beta.2`，或运行：

```sh
dsh plugin --profile web add dsh-plugin-goal-map@0.2.0-beta.2
```

插件根目录包含宿主入口、Cordis bundle补丁及预构建客户端，不需要生产环境再构建。也可以使用完整源码目录或经核验的tarball。通过宿主管理器停用或卸载；不要绕过兼容检查。会话视图标签沿用“流程图”，支持“总览图”和“步骤列表”。

## 数据与隐私

插件只读取宿主已公开的目标、计划、工具生命周期和直接子代理元数据；不读取工具参数/结果正文、不解析聊天/推理、不扫描工作区或历史。无额外模型调用、任务调度、上传、遥测、凭据或持久存储。目标/计划文字和标签本身仍可能敏感，不会自动脱敏，分享前请自己检查。[完整边界](PRIVACY.md)。

## 合成展示图

以下是历史alpha7功能基线的合成示例，不是真实会话、beta.2新截图或市场运行验收。文档图片不进入npm包。

![桌面合成目标进展路线](https://raw.githubusercontent.com/sensen-jo/dsh-plugin-goal-map/4cc4963b48b0bbb06c2d2d67fdf50dc8ab29f780/docs/desktop.png)

![手机尺寸合成示例](https://raw.githubusercontent.com/sensen-jo/dsh-plugin-goal-map/4cc4963b48b0bbb06c2d2d67fdf50dc8ab29f780/docs/mobile.png)

![目标与计划完成标记核对示例](https://raw.githubusercontent.com/sensen-jo/dsh-plugin-goal-map/4cc4963b48b0bbb06c2d2d67fdf50dc8ab29f780/docs/reconcile.png)

## English

Goal Map is a read-only in-session goal-to-plan progress route and mindmap. It uses public DSH projections, declared plan items, tool lifecycle metadata and direct-child status; it does not inspect chat, reasoning, tool payloads or workspace files. No extra model, scheduler, network or storage service is added. Equal-weight declared plan progress is not goal acceptance. Beta.2 targets the explicit DSH Web union `0.2.0-rc.2 || 0.2.1-rc.2` with Node.js >=24. Other versions and browsers remain unverified; see [compatibility](COMPATIBILITY.md) and [release checks](RELEASING.md). Historical screenshots are synthetic examples, not current release or authenticated GUI evidence.
