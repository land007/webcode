#!/usr/bin/env python3
"""PulseAudio null-sink -> WebSocket audio stream (s16le, 44100Hz, stereo)"""
import asyncio
import os
import subprocess
import sys
import websockets

HOST = "127.0.0.1"
PORT = 10006
SAMPLE_RATE = 44100
CHANNELS = 2
CHUNK_SIZE = 16384  # ~186ms per chunk (16384 / (44100 * 2))
PULSE_SINK = "webcode_null"
CLIENTS = set()

# PulseAudio socket path
PULSE_SOCKET = "/run/user/1000/pulse/native"
PULSE_ENV = {**os.environ, "PULSE_SERVER": f"unix:{PULSE_SOCKET}"}


async def broadcast_audio():
    """Read audio from pacat and broadcast to all WebSocket clients."""
    cmd = [
        "pacat", "--record",
        "-d", f"{PULSE_SINK}.monitor",
        "--format=s16le",
        f"--rate={SAMPLE_RATE}",
        f"--channels={CHANNELS}",
        "--latency-msec=10",
        "--property=buffer_time=25000",  # 25ms buffer
        "--property=fragment_time=8533",  # ~8.5ms fragment (1/3 buffer)
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=PULSE_ENV,
    )
    print(f"[audio-ws] pacat started (pid={proc.pid}), broadcasting on ws://{HOST}:{PORT}", flush=True)

    try:
        while True:
            data = await proc.stdout.read(CHUNK_SIZE)
            if not data:
                print(f"[audio-ws] pacat EOF, exit code={await proc.wait()}", flush=True)
                break
            if CLIENTS:
                dead = set()
                for client in list(CLIENTS):
                    try:
                        await client.send(data)
                    except Exception as e:
                        print(f"[audio-ws] send to client failed: {e}", flush=True)
                        dead.add(client)
                CLIENTS.difference_update(dead)
    except Exception as e:
        print(f"[audio-ws] broadcast_audio error: {e}", flush=True)
    finally:
        try:
            proc.terminate()
            await proc.wait()
        except Exception:
            pass


async def handler(ws):
    """Handle WebSocket client connection."""
    CLIENTS.add(ws)
    print(f"[audio-ws] client connected ({len(CLIENTS)} total) from {ws.remote_address}", flush=True)
    try:
        await ws.wait_closed()
    finally:
        CLIENTS.discard(ws)
        print(f"[audio-ws] client disconnected ({len(CLIENTS)} remaining)", flush=True)


async def wait_for_pulseaudio(retries=30):
    """Wait for PulseAudio to be ready."""
    for i in range(retries):
        try:
            result = subprocess.run(
                ["pactl", "info"],
                capture_output=True,
                env=PULSE_ENV,
                timeout=2,
            )
            if result.returncode == 0:
                print("[audio-ws] PulseAudio is ready", flush=True)
                return True
        except Exception as e:
            pass
        print(f"[audio-ws] waiting for PulseAudio ({i+1}/{retries})...", flush=True)
        await asyncio.sleep(1)
    print("[audio-ws] ERROR: PulseAudio did not start in time", flush=True)
    return False


async def wait_for_null_sink(retries=10):
    """Wait for webcode_null sink to be available."""
    for i in range(retries):
        try:
            result = subprocess.run(
                ["pactl", "list", "sinks", "short"],
                capture_output=True,
                text=True,
                env=PULSE_ENV,
                timeout=2,
            )
            if PULSE_SINK in result.stdout:
                print(f"[audio-ws] null-sink '{PULSE_SINK}' is available", flush=True)
                return True
        except Exception as e:
            pass
        print(f"[audio-ws] waiting for null-sink '{PULSE_SINK}' ({i+1}/{retries})...", flush=True)
        await asyncio.sleep(1)
    print(f"[audio-ws] WARNING: null-sink '{PULSE_SINK}' not found, pacat may fail", flush=True)
    return False


async def setup_null_sink():
    """Create null-sink if it doesn't exist."""
    try:
        result = subprocess.run(
            ["pactl", "list", "sinks", "short"],
            capture_output=True,
            text=True,
            env=PULSE_ENV,
        )
        if PULSE_SINK in result.stdout:
            print(f"[audio-ws] null-sink '{PULSE_SINK}' already exists", flush=True)
        else:
            subprocess.run(
                [
                    "pactl", "load-module", "module-null-sink",
                    f"sink_name={PULSE_SINK}",
                    "sink_properties=device.description=WebcodeAudio",
                ],
                env=PULSE_ENV,
                check=True,
            )
            print(f"[audio-ws] null-sink '{PULSE_SINK}' created", flush=True)

        subprocess.run(
            ["pactl", "set-default-sink", PULSE_SINK],
            env=PULSE_ENV,
            check=True,
        )
        print(f"[audio-ws] default sink set to '{PULSE_SINK}'", flush=True)
    except subprocess.CalledProcessError as e:
        print(f"[audio-ws] ERROR setting up null-sink: {e}", flush=True)


async def main():
    if not await wait_for_pulseaudio():
        sys.exit(1)

    await setup_null_sink()
    await wait_for_null_sink()

    async with websockets.serve(handler, HOST, PORT):
        print(f"[audio-ws] WebSocket server listening on ws://{HOST}:{PORT}", flush=True)
        await broadcast_audio()


if __name__ == "__main__":
    asyncio.run(main())
