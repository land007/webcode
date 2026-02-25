#!/usr/bin/env python3
"""PulseAudio null-sink -> WebSocket audio stream (s16le, 44100Hz, stereo)"""
import asyncio
import subprocess
import sys
import websockets

HOST = "127.0.0.1"
PORT = 10006
SAMPLE_RATE = 44100
CHANNELS = 2
CHUNK_SIZE = 4096
PULSE_SINK = "webcode_null"
CLIENTS = set()


async def broadcast_audio():
    cmd = [
        "pacat", "--record",
        "--sink", f"{PULSE_SINK}.monitor",
        "--format=s16le",
        f"--rate={SAMPLE_RATE}",
        f"--channels={CHANNELS}",
        "--latency-msec=50",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    print(f"[audio-ws] pacat started, broadcasting on ws://{HOST}:{PORT}", flush=True)
    try:
        while True:
            data = await proc.stdout.read(CHUNK_SIZE)
            if not data:
                print("[audio-ws] pacat stream ended", flush=True)
                break
            if CLIENTS:
                dead = set()
                for client in list(CLIENTS):
                    try:
                        await client.send(data)
                    except Exception:
                        dead.add(client)
                CLIENTS.difference_update(dead)
    finally:
        proc.terminate()
        await proc.wait()


async def handler(ws):
    CLIENTS.add(ws)
    print(f"[audio-ws] client connected ({len(CLIENTS)} total)", flush=True)
    try:
        await ws.wait_closed()
    finally:
        CLIENTS.discard(ws)
        print(f"[audio-ws] client disconnected ({len(CLIENTS)} remaining)", flush=True)


async def wait_for_pulseaudio(retries=30):
    for i in range(retries):
        result = subprocess.run(["pactl", "info"], capture_output=True)
        if result.returncode == 0:
            print("[audio-ws] PulseAudio is ready", flush=True)
            return True
        print(f"[audio-ws] waiting for PulseAudio ({i+1}/{retries})...", flush=True)
        await asyncio.sleep(1)
    print("[audio-ws] ERROR: PulseAudio did not start in time", flush=True)
    return False


async def setup_null_sink():
    # Check if sink already exists (idempotent)
    result = subprocess.run(
        ["pactl", "list", "sinks", "short"], capture_output=True, text=True
    )
    if PULSE_SINK in result.stdout:
        print(f"[audio-ws] null-sink '{PULSE_SINK}' already exists", flush=True)
    else:
        subprocess.run(
            [
                "pactl", "load-module", "module-null-sink",
                f"sink_name={PULSE_SINK}",
                "sink_properties=device.description=WebcodeAudio",
            ]
        )
        print(f"[audio-ws] null-sink '{PULSE_SINK}' created", flush=True)

    subprocess.run(["pactl", "set-default-sink", PULSE_SINK])
    print(f"[audio-ws] default sink set to '{PULSE_SINK}'", flush=True)


async def main():
    if not await wait_for_pulseaudio():
        sys.exit(1)

    await setup_null_sink()

    async with websockets.serve(handler, HOST, PORT):
        print(f"[audio-ws] WebSocket server listening on ws://{HOST}:{PORT}", flush=True)
        await broadcast_audio()


if __name__ == "__main__":
    asyncio.run(main())
