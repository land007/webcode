#!/bin/bash
# dockerd 条件启动脚本
# 仅在 DinD 模式下实际启动 dockerd，否则 sleep infinity

if [ "${DOCKER_SOCK_MODE:-host}" = "dind" ]; then
  # DinD 模式：启动 dockerd
  exec /usr/bin/dockerd --host=unix:///var/run/docker.sock --storage-driver=overlay2
else
  # 非 DinD 模式：睡眠不启动（supervisor 不会重启）
  sleep infinity
fi
