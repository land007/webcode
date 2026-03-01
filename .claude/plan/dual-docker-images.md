# 双 Docker 镜像构建方案 (Full & Lite)

## 背景

当前项目构建单一 Docker 镜像 `land007/webcode`（~5.66GB），包含：
- **桌面组件**（~40% 体积）：GNOME Flashback、VNC/noVNC、fcitx、PulseAudio、Chrome/Chromium
- **核心组件**：Theia IDE、Vibe Kanban、OpenClaw、Caddy、Docker CLI

项目已有 `MODE=lite` 运行时模式，但仅跳过服务启动，镜像仍包含所有桌面组件。

**目标**：构建两个独立的 Docker 镜像：
- **`land007/webcode`**：完整桌面环境 + 核心服务
- **`land007/webcode_lite`**：仅核心服务，移除桌面组件，预计体积减少 40%

Launcher 根据 Desktop/Lite 模式自动选择对应镜像。

---

## 实施方案

### 1. Dockerfile 修改

**文件**：`Dockerfile`

#### 1.1 添加构建参数（第 13-15 行后）

```dockerfile
ARG WEBCODE_VERSION=dev
ARG INSTALL_DESKTOP=true  # true=full, false=lite
ENV WEBCODE_VERSION=${WEBCODE_VERSION}
```

#### 1.2 用条件语句包裹桌面特定章节

需要修改的 RUN 指令章节：

| 章节 | 行号范围 | 组件 |
|------|---------|------|
| GNOME Flashback | 89-120 | 桌面环境、终端、文件管理器 |
| 语言包 | 102-108 | 中文/英文语言包 |
| 主题配置 | 110-133 | dconf、主题切换脚本、语言切换脚本 |
| VNC/noVNC | 135-143 | TigerVNC、noVNC |
| fcitx 输入法 | 145-151 | fcitx、谷歌拼音、CJK 字体 |
| PulseAudio | 153-162 | 音频服务、WebSocket 音频 |
| 浏览器 | 184-199 | Chrome (amd64) / Chromium (arm64) |
| v2rayN | 213-224 | GUI 代理客户端 |

**修改模式示例**：

```dockerfile
# ─── 6. GNOME Flashback desktop (conditional) ─────────────────────
RUN if [ "$INSTALL_DESKTOP" = "true" ]; then \
        apt-get update && apt-get install -y \
            gnome-session-flashback gnome-terminal nautilus \
            metacity dbus-x11 gnome-panel gnome-settings-daemon \
            # ... 其他包 \
        && apt-get clean && rm -rf /var/lib/apt/lists/*; \
    fi
```

**配置文件 COPY 修改**（第 226-257 行）：

桌面相关配置文件（audio、dind、dashboard、xsession、desktop-shortcuts）仅在 `INSTALL_DESKTOP=true` 时复制或设置权限。

#### 1.3 构建命令

```bash
# Full 镜像（桌面）
docker build --build-arg INSTALL_DESKTOP=true -t land007/webcode:latest .

# Lite 镜像（精简）
docker build --build-arg INSTALL_DESKTOP=false -t land007/webcode_lite:latest .
```

---

### 2. CI/CD 工作流修改

**文件**：`.github/workflows/docker-build.yml`

#### 2.1 当前工作流分析

当前构建单一镜像 `land007/webcode` 并推送到 Docker Hub 和 GHCR。需要扩展为构建两个独立的镜像。

#### 2.2 修改方案

保留现有 Full 镜像构建逻辑，新增 Lite 镜像构建步骤：

```yaml
# ========== Full 镜像构建 ==========
- name: Build and push full image
  uses: docker/build-push-action@v6
  with:
    context: .
    platforms: linux/amd64,linux/arm64
    push: true
    build-args: |
      INSTALL_DESKTOP=true
    tags: |
      land007/webcode:latest
      land007/webcode:${{ github.ref_name }}
      ghcr.io/land007/webcode:latest
      ghcr.io/land007/webcode:${{ github.ref_name }}

# ========== Lite 镜像构建 ==========
- name: Build and push lite image
  uses: docker/build-push-action@v6
  with:
    context: .
    platforms: linux/amd64,linux/arm64
    push: true
    build-args: |
      INSTALL_DESKTOP=false
    tags: |
      land007/webcode_lite:latest
      land007/webcode_lite:${{ github.ref_name }}
      ghcr.io/land007/webcode_lite:latest
      ghcr.io/land007/webcode_lite:${{ github.ref_name }}
```

#### 2.3 镜像命名策略

| 变体 | Docker Hub 镜像名 | GHCR 镜像名 | 用途 |
|------|------------------|-------------|------|
| Full | `land007/webcode:latest` | `ghcr.io/land007/webcode:latest` | 桌面模式 |
| Lite | `land007/webcode_lite:latest` | `ghcr.io/land007/webcode_lite:latest` | Lite 模式 |

---

### 3. Launcher 集成

**文件**：
- `launcher/assets/docker-compose.yml`
- `launcher/src/app.js`
- `launcher/src/config.js`

#### 3.1 Docker Compose 模板修改

**当前**（`launcher/assets/docker-compose.yml` 第 3 行）：
```yaml
image: land007/webcode:latest
```

**修改为**：
```yaml
image: ${IMAGE_NAME:-land007/webcode}:${IMAGE_TAG:-latest}
```

#### 3.2 Launcher 逻辑修改（`launcher/src/app.js`）

**添加模式到镜像名称映射函数**（约第 120 行附近）：

```javascript
/**
 * Map MODE to IMAGE_NAME
 * @param {string} mode - 'desktop' or 'lite'
 * @returns {string} - image name
 */
function modeToImageName(mode) {
  return mode === 'lite' ? 'land007/webcode_lite' : 'land007/webcode';
}
```

**修改 dockerUp 函数**（第 158-164 行）：

```javascript
async function dockerUp(cfg, onData, onClose, options = {}) {
  // 映射模式到镜像名称
  cfg.IMAGE_NAME = cfg.IMAGE_NAME || modeToImageName(cfg.MODE || 'desktop');

  // 始终用最新模板覆盖 docker-compose.yml
  if (cfg.INSTANCE_ID) {
    ensureInstanceComposeFile(cfg.INSTANCE_ID);
  } else {
    ensureComposeFile();
  }
  // ... 其余代码
```

**修改镜像拉取逻辑**（第 171-172 行）：

```javascript
// 从
const imageName = 'land007/webcode:latest';
const ghcrImage = 'ghcr.io/land007/webcode:latest';

// 改为
const registry = cfg.IMAGE_REGISTRY || '';
const name = cfg.IMAGE_NAME || 'land007/webcode';
const tag = cfg.IMAGE_TAG || 'latest';
const imageName = registry ? `${registry}/${name}:${tag}` : `${name}:${tag}`;
const ghcrImage = `ghcr.io/${name}:${tag}`;
```

**修改配置保存函数**（约第 533 行 `saveWizardConfig()` 和第 2138 行 `saveWsConfig()`）：

在保存配置前添加：
```javascript
cfg.IMAGE_NAME = modeToImageName(selectedMode); // 或 wsMode
```

#### 3.3 默认配置修改（`launcher/src/config.js`）

**第 12 行附近**，添加镜像名称配置：

```javascript
const defaultConfig = {
  MODE: 'desktop',
  IMAGE_NAME: 'land007/webcode',  // 新增
  IMAGE_TAG: 'latest',            // 新增
  IMAGE_REGISTRY: '',             // 新增，可选
  AUTH_USER: 'admin',
  // ...
```

---

## 实施步骤

### 阶段 1：Dockerfile 修改（基础）

1. 在 `Dockerfile` 第 15 行后添加 `ARG INSTALL_DESKTOP=true`
2. 用 `RUN if [ "$INSTALL_DESKTOP" = "true" ]; then ...; fi` 包裹以下章节：
   - 第 89-120 行：GNOME Flashback
   - 第 102-108 行：语言包
   - 第 110-133 行：桌面配置脚本
   - 第 135-143 行：VNC/noVNC
   - 第 145-151 行：fcitx
   - 第 153-162 行：PulseAudio
   - 第 184-199 行：浏览器
   - 第 213-224 行：v2rayN
3. 修改桌面配置文件 COPY 部分（第 226-257 行），仅在 `INSTALL_DESKTOP=true` 时复制/设置权限
4. 本地测试构建：
   ```bash
   docker build --build-arg INSTALL_DESKTOP=true -t land007/webcode:test-full .
   docker build --build-arg INSTALL_DESKTOP=false -t land007/webcode_lite:test-lite .
   docker run --rm land007/webcode:test-full ls /usr/bin/gnome-session
   docker run --rm land007/webcode_lite:test-lite ls /usr/bin/gnome-session  # 应该失败
   ```

### 阶段 2：CI/CD 更新（自动化）

1. 编辑 `.github/workflows/docker-build.yml`
2. 保留现有 build-push-action 步骤（Full 镜像）
3. 新增第二个 build-push-action 步骤（Lite 镜像）：
   - `build-args: INSTALL_DESKTOP=false`
   - `tags: land007/webcode_lite:latest`
4. 提交 PR 测试 CI/CD 工作流

### 阶段 3：Launcher 集成（用户体验）

1. 修改 `launcher/assets/docker-compose.yml`：
   ```yaml
   image: ${IMAGE_NAME:-land007/webcode}:${IMAGE_TAG:-latest}
   ```
2. 修改 `launcher/src/app.js`：
   - 添加 `modeToImageName()` 函数
   - 修改 `dockerUp()` 设置 `cfg.IMAGE_NAME`
   - 修改镜像名称构建逻辑（支持 registry）
   - 修改配置保存函数
3. 修改 `launcher/src/config.js`：
   - 添加 `IMAGE_NAME: 'land007/webcode'`
   - 添加 `IMAGE_TAG: 'latest'`
   - 添加 `IMAGE_REGISTRY: ''`
4. 本地测试 launcher 启动流程

### 阶段 4：验证与文档

1. 测试 multi-arch 构建（amd64/arm64）
2. 验证镜像体积缩减（预期 lite ≤ 3.5GB）
3. 更新 README.md 文档：
   - 说明两个镜像的区别
   - 提供镜像拉取命令
   - 更新环境变量说明
4. 发布版本并测试用户迁移流程

---

## 验证清单

### Dockerfile 验证

- [ ] Full 镜像（`INSTALL_DESKTOP=true`）构建成功
- [ ] Lite 镜像（`INSTALL_DESKTOP=false`）构建成功
- [ ] Full 镜像包含桌面组件（`gnome-session`、`vncserver` 等）
- [ ] Lite 镜像不包含桌面组件
- [ ] Desktop 模式 + Full 镜像正常工作
- [ ] Lite 模式 + Lite 镜像正常工作
- [ ] Lite 镜像体积 ≤ 3.5GB（~40% 缩减）

### CI/CD 验证

- [ ] GitHub Actions 工作流成功完成
- [ ] `land007/webcode:latest` 推送到 Docker Hub
- [ ] `land007/webcode_lite:latest` 推送到 Docker Hub
- [ ] `ghcr.io/land007/webcode:latest` 推送到 GHCR
- [ ] `ghcr.io/land007/webcode_lite:latest` 推送到 GHCR
- [ ] Multi-arch（amd64/arm64）构建成功

### Launcher 验证

- [ ] Desktop 模式自动拉取 `land007/webcode:latest`
- [ ] Lite 模式自动拉取 `land007/webcode_lite:latest`
- [ ] 新建实例流程正常
- [ ] 编辑实例流程正常
- [ ] 配置持久化正常
- [ ] 镜像拉取失败时自动尝试 GHCR 回退

### 回归测试

- [ ] 现有用户不受影响（`land007/webcode:latest` 仍可用）
- [ ] 数据卷在镜像切换时正常保留
- [ ] 所有服务端口映射正确
- [ ] Lite 模式下 VNC 端口（20004、20005）不暴露

---

## 关键文件清单

| 文件 | 修改内容 | 行号/位置 |
|------|---------|----------|
| `Dockerfile` | 添加 `INSTALL_DESKTOP` 参数，用条件语句包裹桌面组件 | 第 15 行后，89-224 行 |
| `.github/workflows/docker-build.yml` | 新增 `land007/webcode_lite` 构建步骤 | 新增 build-push-action |
| `launcher/assets/docker-compose.yml` | 镜像名改为 `${IMAGE_NAME}` 和 `${IMAGE_TAG}` 变量 | 第 3 行 |
| `launcher/src/app.js` | 添加 `modeToImageName()`，修改 `dockerUp()` 和镜像拉取 | 第 120、158、171 行 |
| `launcher/src/config.js` | 默认配置添加 `IMAGE_NAME`、`IMAGE_TAG`、`IMAGE_REGISTRY` | 第 12 行附近 |

---

## 预期成果

- **Full 镜像** `land007/webcode`：~5.6GB（与当前一致）
- **Lite 镜像** `land007/webcode_lite`：~3.2-3.5GB（减少 40%）
- **自动化构建**：CI/CD 自动构建和发布两个独立镜像
- **智能选择**：Launcher 根据模式自动拉取对应镜像
- **零破坏性**：现有用户使用 `land007/webcode:latest` 无影响
- **清晰命名**：两个镜像通过名称区分，易于理解

---

## 使用示例

### 手动使用

```bash
# Desktop 模式（Full 镜像）
docker compose up -d
# 或
IMAGE_NAME=land007/webcode docker compose up -d

# Lite 模式（Lite 镜像）
MODE=lite IMAGE_NAME=land007/webcode_lite docker compose up -d
```

### Launcher 使用

1. 打开 Launcher
2. 选择 "Desktop" 模式 → 自动使用 `land007/webcode:latest`
3. 选择 "Lite" 模式 → 自动使用 `land007/webcode_lite:latest`
4. 点击启动 → 自动拉取对应镜像
