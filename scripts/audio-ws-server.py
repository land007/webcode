#!/usr/bin/env python3
"""PulseAudio null-sink -> WebSocket audio stream (s16le, 44100Hz, stereo)
Full-duplex: also accepts inbound binary messages from browser mic and writes
them into a webcode_input null-sink via pacat --playback.
"""
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
PULSE_INPUT_SINK = "webcode_input"
CLIENTS = set()

# PulseAudio socket path
PULSE_SOCKET = "/run/user/1000/pulse/native"
PULSE_ENV = {**os.environ, "PULSE_SERVER": f"unix:{PULSE_SOCKET}"}

# pacat --playback subprocess for microphone input
pacat_in_proc = None


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
    """Handle WebSocket client connection (full-duplex)."""
    CLIENTS.add(ws)
    print(f"[audio-ws] client connected ({len(CLIENTS)} total) from {ws.remote_address}", flush=True)
    try:
        async for message in ws:
            if isinstance(message, bytes) and pacat_in_proc and pacat_in_proc.stdin:
                try:
                    pacat_in_proc.stdin.write(message)
                    await pacat_in_proc.stdin.drain()
                except Exception as e:
                    print(f"[audio-ws] mic input write error: {e}", flush=True)
    except Exception:
        pass
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


async def setup_input_sink():
    """Create webcode_input null-sink and wrap its monitor as a normal source.

    Chrome filters out PA_SOURCE_MONITOR sources during getUserMedia enumeration.
    module-remap-source wraps webcode_input.monitor into a plain source 'webcode_mic'
    without the MONITOR flag, so Chrome can enumerate and select it.
    """
    try:
        # 1. Create webcode_input null-sink if missing
        result = subprocess.run(
            ["pactl", "list", "sinks", "short"],
            capture_output=True,
            text=True,
            env=PULSE_ENV,
        )
        if PULSE_INPUT_SINK in result.stdout:
            print(f"[audio-ws] null-sink '{PULSE_INPUT_SINK}' already exists", flush=True)
        else:
            subprocess.run(
                [
                    "pactl", "load-module", "module-null-sink",
                    f"sink_name={PULSE_INPUT_SINK}",
                    "sink_properties=device.description=WebcodeMic",
                ],
                env=PULSE_ENV,
                check=True,
            )
            print(f"[audio-ws] null-sink '{PULSE_INPUT_SINK}' created", flush=True)

        # 2. Wrap webcode_input.monitor as plain source 'webcode_mic' (no MONITOR flag)
        src_result = subprocess.run(
            ["pactl", "list", "sources", "short"],
            capture_output=True,
            text=True,
            env=PULSE_ENV,
        )
        if "webcode_mic" in src_result.stdout:
            print("[audio-ws] remap-source 'webcode_mic' already exists", flush=True)
        else:
            subprocess.run(
                [
                    "pactl", "load-module", "module-remap-source",
                    "source_name=webcode_mic",
                    f"master={PULSE_INPUT_SINK}.monitor",
                    "source_properties=device.description=WebcodeMicrophone",
                ],
                env=PULSE_ENV,
                check=True,
            )
            print("[audio-ws] remap-source 'webcode_mic' created", flush=True)

        # 3. Set webcode_mic as default source
        subprocess.run(
            ["pactl", "set-default-source", "webcode_mic"],
            env=PULSE_ENV,
            check=True,
        )
        print("[audio-ws] default source set to 'webcode_mic'", flush=True)

    except subprocess.CalledProcessError as e:
        print(f"[audio-ws] ERROR setting up input sink: {e}", flush=True)


async def start_input_playback():
    """Start pacat --playback to feed browser mic audio into webcode_input."""
    global pacat_in_proc
    cmd = [
        "pacat", "--playback",
        "-d", PULSE_INPUT_SINK,
        "--format=s16le",
        f"--rate={SAMPLE_RATE}",
        f"--channels={CHANNELS}",
        "--latency-msec=20",
    ]
    pacat_in_proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=PULSE_ENV,
    )
    print(f"[audio-ws] pacat --playback started (pid={pacat_in_proc.pid}) for mic input", flush=True)


async def main():
    if not await wait_for_pulseaudio():
        sys.exit(1)

    await setup_null_sink()
    await wait_for_null_sink()
    await setup_input_sink()
    await start_input_playback()

    async with websockets.serve(handler, HOST, PORT):
        print(f"[audio-ws] WebSocket server listening on ws://{HOST}:{PORT}", flush=True)
        await broadcast_audio()


if __name__ == "__main__":
    asyncio.run(main())
