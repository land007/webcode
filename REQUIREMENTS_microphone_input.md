# 需求：为 webcode 添加浏览器麦克风输入到容器功能

## 1. 需求背景

当前 webcode 已实现音频输出功能（容器 → 浏览器），通过 PulseAudio null-sink + WebSocket 实现。用户希望在 noVNC 环境中使用麦克风，以支持：
- 视频会议（Zoom、Discord、Google Meet）
- 语音通话（微信语音、WhatsApp Web）
- 语音录制/语音识别等应用

**关键需求**：
- ✅ 全双工音频支持（同时播放容器音频并接收浏览器麦克风）
- ✅ 低延迟（< 100ms）以满足实时通信需求
- ✅ 高质量音频（44100Hz 立体声）
- ✅ 独立的麦克风控制按钮（与音频输出按钮分开）

## 2. 当前架构

**单向音频（已有）**：
```
容器应用 → PulseAudio null-sink → pacat → WebSocket → 浏览器播放
```

**目标架构（双向）**：
```
容器音频输出 → PulseAudio null-sink → WebSocket → 浏览器播放
浏览器麦克风输入 → MediaStream API → WebSocket → PulseAudio → 容器应用
```

## 3. 技术方案

采用 **WebSocket + PulseAudio pipe-source** 方案：

**架构设计**：
- 单个 WebSocket 连接（端口 20006）同时处理音频输入和输出
- 服务器 → 客户端：音频输出（已有）
- 客户端 → 服务器：音频输入（新增）

**组件说明**：
1. **WebSocket 服务器** (端口 20006)
   - 输出：从 `webcode_null.monitor` 读取 → 广播给所有客户端
   - 输入：接收客户端音频 → 写入 pipe sink → PulseAudio

2. **PulseAudio 配置**
   - 输出源：`webcode_null` sink（已有）
   - 输入源：`webcode_input` pipe sink + `webcode_input.monitor` source

3. **浏览器端**
   - 音频输出按钮（已有）🔊
   - 麦克风输入按钮（新增）🎤

## 4. 实现要求

### 4.1 修改 `scripts/audio-ws-server.py`

**需求**：扩展 WebSocket 服务器支持接收客户端音频

**实现要点**：
```python
# 添加全局变量
PULSE_SINK_INPUT = "webcode_input"
CLIENTS = set()

# 创建 pipe sink
async def start_pipe_source():
    # 1. 创建 FIFO 文件
    fifo_path = "/run/user/1000/pulse/webcode_input.fifo"
    subprocess.run(["mkfifo", fifo_path])

    # 2. 加载 module-pipe-sink
    subprocess.run([
        "pactl", "load-module", "module-pipe-sink",
        f"sink_name={PULSE_SINK_INPUT}",
        f"file={fifo_path}",
        "format=s16le",
        "rate=44100",
        "channels=2"
    ])

    # 3. 设置默认源
    subprocess.run(["pactl", "set-default-source", "webcode_input.monitor"])

    # 4. 启动 pacat 写入音频
    proc = await asyncio.create_subprocess_exec(
        "pacat", "--playback",
        "-d", PULSE_SINK_INPUT,
        "--format=s16le",
        "--rate=44100",
        "--channels=2",
        stdin=asyncio.subprocess.PIPE
    )

# 修改 handler 接收音频
async def handler(ws):
    CLIENTS.add(ws)
    async for message in ws:
        if pipe_source_proc and pipe_source_proc.stdin:
            pipe_source_proc.stdin.write(message)
            await pipe_source_proc.stdin.drain()
```

### 4.2 修改 `configs/audio-bar.js`

**需求**：添加独立的麦克风按钮和音频采集功能

**实现要点**：
```javascript
// 麦克风图标（SVG）
function getMicIcon(state) {
  // 返回 off/on/error 三种状态的 SVG
}

// 创建麦克风按钮（插入到全屏按钮前）
const micBtn = document.createElement('input');
micBtn.type = 'image';
micBtn.id = 'noVNC_mic_button';
micBtn.className = 'noVNC_button';
micBtn.alt = '麦克风';
micBtn.title = '桌面麦克风';
micBtn.src = 'data:image/svg+xml;base64,' + btoa(getMicIcon('off'));

// 麦克风控制逻辑
async function startMicrophone() {
  // 1. 检测 nw.js 环境
  var isNW = (typeof process !== 'undefined' && process.versions['node-webkit']);
  if (isNW) {
    alert('麦克风功能在 nw.js 环境中可能不可用。请使用常规浏览器。');
    return;
  }

  // 2. 获取麦克风权限
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: 44100,
      channelCount: 2,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  // 3. 创建音频处理链
  const audioCtx = new AudioContext({ sampleRate: 44100 });
  const source = audioCtx.createMediaStreamSource(mediaStream);
  const processor = audioCtx.createScriptProcessor(16384, 2, 2);

  // 4. 转换 Float32 → Int16 s16le
  processor.onaudioprocess = (e) => {
    const left = e.inputBuffer.getChannelData(0);
    const right = e.inputBuffer.getChannelData(1);
    const pcm = new Int16Array(left.length * 2);
    for (var i = 0; i < left.length; i++) {
      pcm[i * 2] = Math.max(-32768, Math.min(32767, left[i] * 32768));
      pcm[i * 2 + 1] = Math.max(-32768, Math.min(32767, right[i] * 32768));
    }
    micWs.send(pcm.buffer);
  };

  // 5. 连接 WebSocket（复用端口 20006）
  micWs = new WebSocket('ws://' + location.hostname + ':20006');
  micWs.binaryType = 'arraybuffer';
}
```

### 4.3 修改 `Dockerfile`

**需求**：配置容器内 Chromium 使用 PulseAudio 音频输入

**实现要点**：
```dockerfile
# 修改 browser wrapper 脚本
RUN if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
        # ... Chrome 安装代码 ...
        && printf '#!/bin/sh\nHOSTNAME=$$(hostname)\nUSER_DATA_DIR=/home/ubuntu/.config/google-chrome-$$HOSTNAME\nmkdir -p "$$USER_DATA_DIR"\nexport PULSE_SERVER="unix:/run/user/1000/pulse/native"\nexport PULSE_SINK="webcode_null"\nexport PULSE_SOURCE="webcode_input.monitor"\nexec /usr/bin/google-chrome-stable --user-data-dir="$$USER_DATA_DIR" --password-store=basic --enable-audio-input-spaces --audio-backend=pulseaudio "$@"\n' > /usr/local/bin/browser \
        && chmod +x /usr/local/bin/browser; \
    else \
        # ... Chromium 安装代码 ...
        && printf '#!/bin/sh\nHOSTNAME=$$(hostname)\nUSER_DATA_DIR=/home/ubuntu/.config/chromium-$$HOSTNAME\nmkdir -p "$$USER_DATA_DIR"\nexport PULSE_SERVER="unix:/run/user/1000/pulse/native"\nexport PULSE_SINK="webcode_null"\nexport PULSE_SOURCE="webcode_input.monitor"\nexec /usr/bin/chromium --user-data-dir="$$USER_DATA_DIR" --password-store=basic --enable-audio-input-spaces --audio-backend=pulseaudio "$@"\n' > /usr/local/bin/browser \
        && chmod +x /usr/local/bin/browser; \
    fi
```

## 5. UI 设计

**noVNC 工具栏布局**（从左到右）：
```
[键盘] [额外按键] [Ctrl] [Alt] [Tab] [Esc] [Ctrl+Alt+Del] [麦克风] [音频] [全屏] [设置] [断开连接]
                                           🎤        🔊
```

**麦克风按钮状态**：
- **关闭（默认）**：白色 SVG 图标，className="noVNC_button"
- **开启**：白色 SVG 图标，className="noVNC_button noVNC_selected"
- **错误**：白色 SVG 图标，className="noVNC_button"

## 6. 验证步骤

### 6.1 基础功能测试

1. **构建并启动容器**
   ```bash
   docker build -t webcode .
   docker compose up -d --force-recreate
   ```

2. **验证 pipe sink 创建**
   ```bash
   docker exec -u ubuntu webcode pactl list sources short
   # 应看到 webcode_input.monitor
   ```

3. **验证双向 WebSocket 服务器**
   ```bash
   docker exec webcode ss -tlnp | grep 10006
   # 应显示 LISTEN ... 127.0.0.1:10006
   ```

4. **测试 echo 功能**
   - 打开 noVNC 页面
   - 点击麦克风按钮，允许浏览器访问麦克风
   - 对着浏览器说话
   - 在容器内运行测试脚本验证音频传输

### 6.2 全双工测试

1. **同时开启音频输出和麦克风**
   - 点击音频输出按钮（🔊）
   - 点击麦克风按钮（🎤）
   - 两个按钮都应显示为选中状态

2. **播放音频同时说话**
   - 在容器内播放音乐
   - 对着浏览器麦克风说话
   - 验证音频同时双向传输

### 6.3 实际应用测试

1. **视频会议测试**（Zoom/Discord）
   - 在容器内打开视频会议应用
   - 同时开启音频输出和麦克风
   - 验证会议中的双向音频

2. **浏览器权限测试**
   - 测试 Chrome/Edge/Firefox 浏览器
   - 验证 getUserMedia API 正常工作
   - nw.js 环境应显示友好提示

## 7. 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| **单向延迟** | < 100ms | 从浏览器麦克风到容器应用的端到端延迟 |
| **音频质量** | 44100Hz, 16bit, 立体声 | 匹配现有音频输出质量 |
| **全双工支持** | ✅ 是 | 同时支持音频输出和输入，互不干扰 |
| **并发连接** | 1 输入 + N 输出 | 多个浏览器可接收输出，但输入需单客户端 |

## 8. 已知限制和解决方案

### 8.1 nw.js 环境
**限制**：nw.js 不支持或部分支持 getUserMedia API
**解决**：检测 nw.js 环境，显示友好提示建议使用常规浏览器

### 8.2 回声问题
**限制**：全双工场景下，扬声器声音会被麦克风录入
**临时方案**：建议用户使用耳机
**未来改进**：实现浏览器端或容器端回声消除（AEC）

### 8.3 浏览器权限
**限制**：需要用户授予麦克风权限
**处理**：清晰的错误提示和权限引导

## 9. 文件清单

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `scripts/audio-ws-server.py` | 修改 | 扩展 WebSocket handler 支持接收客户端音频 |
| `configs/audio-bar.js` | 修改 | 添加麦克风按钮和音频采集逻辑 |
| `Dockerfile` | 修改 | 更新 browser 脚本配置 PulseAudio |

## 10. 参考代码分支

已实现版本位于：`feature/microphone-input` 分支
- 提交 ID: c8a2bca
- GitHub PR: https://github.com/land007/webcode/pull/new/feature/microphone-input

可参考该分支的完整实现。

## 11. 交付物

1. ✅ 修改后的 `scripts/audio-ws-server.py`
2. ✅ 修改后的 `configs/audio-bar.js`
3. ✅ 修改后的 `Dockerfile`
4. ✅ 功能验证通过
5. ✅ 支持主流视频会议应用

## 12. 验收标准

- [ ] 在 noVNC 中能看到麦克风按钮
- [ ] 点击麦克风按钮能请求浏览器麦克风权限
- [ ] 允许权限后按钮变为选中状态
- [ ] 容器内 Chromium 能检测到 `webcode_input.monitor` 音频输入设备
- [ ] 在 Chromium 中能成功获取麦克风权限
- [ ] 音频延迟 < 100ms
- [ ] 支持全双工音频（同时播放和录制）
- [ ] 视频会议应用能正常使用麦克风
