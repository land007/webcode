#!/bin/bash
# 离线启动 NW.js 应用

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NW_CACHE="$SCRIPT_DIR/.nw-cache"

# 检测当前系统
OS="$(uname -s)"
ARCH="$(uname -m)"

# 确定平台名称
case "$OS" in
    Darwin)
        PLATFORM="osx"
        ;;
    Linux)
        PLATFORM="linux"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        PLATFORM="win"
        ;;
    *)
        echo "不支持的操作系统: $OS"
        exit 1
        ;;
esac

case "$ARCH" in
    x86_64)
        ARCH_SUFFIX="x64"
        ;;
    aarch64|arm64)
        ARCH_SUFFIX="arm64"
        ;;
    *)
        echo "不支持的架构: $ARCH"
        exit 1
        ;;
esac

NW_DIR="$NW_CACHE/nwjs-v0.108.0-$PLATFORM-$ARCH_SUFFIX"

# 检查缓存是否存在
if [ ! -d "$NW_DIR" ]; then
    echo "错误: 找不到本地 NW.js 缓存: $NW_DIR"
    echo "请先运行在线版本下载缓存，或手动下载 NW.js 到 .nw-cache 目录"
    exit 1
fi

# 根据平台启动
case "$PLATFORM" in
    osx)
        # 尝试查找 nw 或 nwjs 可执行文件
        NW_BIN="$NW_DIR/nwjs.app/Contents/MacOS/nwjs"
        if [ ! -f "$NW_BIN" ]; then
            NW_BIN="$NW_DIR/nwjs.app/Contents/MacOS/nw"
        fi
        if [ -f "$NW_BIN" ]; then
            exec "$NW_BIN" "$SCRIPT_DIR"
        else
            echo "错误: 找不到 nw 可执行文件"
            echo "查找路径: $NW_DIR/nwjs.app/Contents/MacOS/"
            exit 1
        fi
        ;;
    linux)
        if [ -f "$NW_DIR/nw" ]; then
            exec "$NW_DIR/nw" "$SCRIPT_DIR"
        else
            echo "错误: 找不到 nw 可执行文件"
            exit 1
        fi
        ;;
    win)
        if [ -f "$NW_DIR/nw.exe" ]; then
            exec "$NW_DIR/nw.exe" "$SCRIPT_DIR"
        else
            echo "错误: 找不到 nw.exe"
            exit 1
        fi
        ;;
esac
