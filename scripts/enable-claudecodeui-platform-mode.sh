#!/bin/bash
#
# Enable Platform mode for ClaudeCodeUI（免登录配置）
#
# 原理：
# 1. 通过环境变量 VITE_IS_PLATFORM=true 启用Platform模式
# 2. 修改 auth.js 的 /status 端点，让Platform模式下返回已认证
# 3. 不指定数据库路径，让ClaudeCodeUI自己管理
#

set -e

echo "[claudecodeui] 正在启用 Platform mode（免登录）..."

AUTH_JS="/usr/lib/node_modules/@siteboon/claude-code-ui/server/routes/auth.js"

# 检查文件是否存在
if [ ! -f "$AUTH_JS" ]; then
  echo "[错误] 未找到文件: $AUTH_JS"
  echo "ClaudeCodeUI 可能未安装或版本不兼容"
  exit 1
fi

# 备份原文件
if [ ! -f "${AUTH_JS}.platform.bak" ]; then
  cp "$AUTH_JS" "${AUTH_JS}.platform.bak"
  echo "[备份] 已备份原文件到: ${AUTH_JS}.platform.bak"
fi

# 检查是否有 /status 端点
if ! grep -q 'router.get("/status"' "$AUTH_JS"; then
  echo "[错误] 未找到 /status 端点，可能版本不兼容"
  exit 1
fi

# 添加 IS_PLATFORM 导入（如果还没有）
if ! grep -q 'from "../constants/config.js"' "$AUTH_JS"; then
  # 在第一个 import 语句后面添加
  sed -i '0,/from \.\.\/middleware/s//from "../constants/config.js";\nimport { generateToken, authenticateToken } from "..\/middleware\/auth.js";/' "$AUTH_JS"
fi

# 修改 /status 端点，将 isAuthenticated: false 改为条件判断
# 使用更稳健的方式：找到包含 isAuthenticated: false 的行并替换
perl -i -0pe 's|(router\.get\("/status".*?isAuthenticated: false)(.*?)\n\s*\}\s*\);\s*$|router\.get("/status", async (req, res) => {\n  try {\n    const hasUsers = await userDb.hasUsers();\n    let isAuthenticated = false;\n    if (IS_PLATFORM && hasUsers) {\n      isAuthenticated = true;\n    }\n    res\.json({\n      needsSetup: !hasUsers,\n      isAuthenticated\n    });\n  } catch (error) {\n    console\.error("Auth status error:", error);\n    res\.status(500)\.json({ error: "Internal server error" });\n  }\n});|gs' "$AUTH_JS" 2>/dev/null || {
  # 如果perl失败，使用更简单的sed方式
  sed -i 's/isAuthenticated: false,/isAuthenticated: IS_PLATFORM \&\& hasUsers ? true : false,/' "$AUTH_JS"
}

# 验证修改
if grep -q "IS_PLATFORM" "$AUTH_JS"; then
  echo "[✓] 已添加 IS_PLATFORM 导入"
else
  echo "[警告] 未能添加 IS_PLATFORM 导入，请手动检查"
fi

if grep -q "IS_PLATFORM.*hasUsers" "$AUTH_JS"; then
  echo "[✓] 已修改 /status 端点的认证逻辑"
else
  echo "[警告] 可能未能正确修改认证逻辑，请手动检查"
fi

echo ""
echo "[完成] ClaudeCodeUI Platform mode 配置完成"
echo "[提示] 请确保在环境变量中设置 VITE_IS_PLATFORM=true"
