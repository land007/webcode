# Theia 包配置优化计划

对比本地 `configs/theia-package.json`（v1.68.2）与官方 Theia 1.69.0 browser 示例的差异分析。

---

## 当前状态（本地已有）

```
@theia/core, @theia/editor, @theia/scm, @theia/scm-extra,
@theia/file-search, @theia/filesystem, @theia/getting-started,
@theia/markers, @theia/messages, @theia/monaco, @theia/navigator,
@theia/outline-view, @theia/plugin-ext, @theia/plugin-ext-vscode,
@theia/preferences, @theia/process, @theia/search-in-workspace,
@theia/terminal, @theia/vsx-registry, @theia/workspace,
lodash (无需直接依赖，应删除)
```

---

## 第一优先级 — 强烈建议添加（影响核心开发体验）

| 包 | 功能 | 原因 |
|---|---|---|
| `@theia/debug` | 断点调试 | 开发环境无调试几乎残废，配合 vscode-builtin DAP 扩展使用 |
| `@theia/console` | 调试控制台输出面板 | debug 必须搭配，显示 REPL 和调试输出 |
| `@theia/output` | 输出面板（构建/任务输出） | 很多 VS Code 扩展依赖 output channel API |
| `@theia/task` | 任务运行器（tasks.json 支持） | 构建/运行项目的标准方式 |
| `@theia/variable-resolver` | 解析 `${workspaceFolder}` 等变量 | task 和 debug 配置都依赖它 |
| `@theia/timeline` | SCM 时间线视图 | 有了 vscode.git 之后 timeline 才完整 |
| `@theia/userstorage` | 用户设置持久化存储 | 没有它用户修改的设置重启后丢失 |
| `@theia/plugin-ext-headless` | 无头插件宿主 | 官方推荐与 `@theia/plugin-ext` 配套使用 |
| `@theia/keymaps` | 快捷键自定义 | 用户可以修改键绑定，且官方示例标配 |

---

## 第二优先级 — 建议添加（明显改善体验）

| 包 | 功能 |
|---|---|
| `@theia/editor-preview` | 文件预览模式（单击不锁定 tab，双击才固定） |
| `@theia/preview` | Markdown / HTML 预览面板 |
| `@theia/mini-browser` | IDE 内嵌浏览器（可在 Theia 内打开网页） |
| `@theia/bulk-edit` | 支持重构/全局替换等批量编辑操作 |
| `@theia/callhierarchy` | 函数调用层级视图 |
| `@theia/typehierarchy` | 类型/继承层级视图 |
| `@theia/secondary-window` | 面板弹出为独立浏览器窗口 |
| `@theia/terminal-manager` | 多终端命名和分组管理 |

---

## 第三优先级 — 可选（特定场景）

| 包 | 功能 | 说明 |
|---|---|---|
| `@theia/notebook` | Jupyter Notebook 支持 | 需要数据科学工作流时添加 |
| `@theia/toolbar` | 可定制工具栏 | 美化/便捷操作 |
| `@theia/property-view` | 属性视图面板 | 一般用不到 |
| `@theia/test` | 测试运行器集成 | 有需要时再加 |

---

## 不添加（不适合 webcode 场景）

| 包 | 原因 |
|---|---|
| 所有 `@theia/ai-*` | webcode 已有 OpenClaw AI 网关，功能重叠 |
| `@theia/collaboration` | 实时协作，复杂且非核心需求 |
| `@theia/dev-container` | 已经在 Docker 容器里，没有意义 |
| `@theia/remote` | 已经是远程访问 IDE，不适用 |
| `@theia/memory-inspector` | 专用内存调试，过于专业 |
| `@theia/metrics` | 服务端运维指标，不是 IDE 功能 |
| `@theia/scanoss` | 开源许可证扫描，特定企业场景 |
| `@theia/plugin-dev` | 仅 Theia 插件开发者需要 |
| `@theia/api-samples` / `@theia/api-provider-sample` | 示例代码，非功能 |

---

## 待执行变更（configs/theia-package.json）

### 删除
```
"lodash": "^4.17.21"
```

### 第一批新增（推荐一次性全部加入，避免多次重新构建）
```json
"@theia/debug": "1.68.2",
"@theia/console": "1.68.2",
"@theia/output": "1.68.2",
"@theia/task": "1.68.2",
"@theia/variable-resolver": "1.68.2",
"@theia/timeline": "1.68.2",
"@theia/userstorage": "1.68.2",
"@theia/plugin-ext-headless": "1.68.2",
"@theia/keymaps": "1.68.2"
```

### 第二批新增（可与第一批合并）
```json
"@theia/editor-preview": "1.68.2",
"@theia/preview": "1.68.2",
"@theia/mini-browser": "1.68.2",
"@theia/bulk-edit": "1.68.2",
"@theia/callhierarchy": "1.68.2",
"@theia/typehierarchy": "1.68.2",
"@theia/secondary-window": "1.68.2",
"@theia/terminal-manager": "1.68.2"
```

---

## 注意事项

- 每次修改 `configs/theia-package.json` 都会触发 Docker **step 4**（`npm install + theia build`）
  重新执行，这是整个 Dockerfile 中最慢的步骤（通常需要 30-60 分钟）。
- 建议**一次性**把所有要加的包合并到一次提交中，避免反复触发重建。
- 添加 `@theia/debug` 后还需在 Dockerfile step 4c 中同样安装对应的 VS Code DAP 扩展
  （如 `vscode.node-debug2` 或 `vscode.js-debug`），否则调试面板有 UI 没实现。
