#!/bin/bash
# Wrapper for audio-ws-server.py to ensure correct environment
export HOME="/home/ubuntu"
export XDG_RUNTIME_DIR="/run/user/1000"
export PULSE_SERVER="unix:/run/user/1000/pulse/native"
export DISPLAY=":1"

exec /usr/bin/python3 /opt/audio-ws-server.py
