#!/usr/bin/env python3
"""PulseAudio null-sink -> WebSocket audio stream (s16le, 44100Hz, stereo)
   Bidirectional: broadcasts audio output, receives audio input from clients
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
PULSE_SINK_INPUT = "webcode_input"  # Pipe sink for microphone input
PULSE_SOURCE_VIRTUAL = "webcode_mic_virtual"  # Virtual source for Chromium
CLIENTS = set()

# PulseAudio socket path
PULSE_SOCKET = "/run/user/1000/pulse/native"
PULSE_ENV = {**os.environ, "PULSE_SERVER": f"unix:{PULSE_SOCKET}"}

# Pipe source process for audio input
pipe_source_proc = None


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
    """Handle WebSocket client connection (bidirectional)."""
    CLIENTS.add(ws)
    print(f"[audio-ws] client connected ({len(CLIENTS)} total) from {ws.remote_address}", flush=True)
    try:
        # Receive audio input from client and send to PulseAudio pipe source
        async for message in ws:
            if isinstance(message, bytes) and pipe_source_proc and pipe_source_proc.stdin:
                try:
                    pipe_source_proc.stdin.write(message)
                    await pipe_source_proc.stdin.drain()
                except Exception as e:
                    print(f"[audio-ws] failed to write to pipe source: {e}", flush=True)
                    break
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


async def start_pipe_source():
    """Create pipe sink for audio input (browser microphone -> container)."""
    global pipe_source_proc

    # Create FIFO file for pipe sink
    fifo_path = f"/run/user/1000/pulse/{PULSE_SINK_INPUT}.fifo"
    try:
        # Remove old FIFO if exists
        subprocess.run(["rm", "-f", fifo_path], env=PULSE_ENV)
        # Create new FIFO
        subprocess.run(["mkfifo", fifo_path], env=PULSE_ENV, check=True)
        print(f"[audio-ws] FIFO created at {fifo_path}", flush=True)
    except subprocess.CalledProcessError as e:
        print(f"[audio-ws] ERROR creating FIFO: {e}", flush=True)
        return

    # Create pipe sink module
    try:
        result = subprocess.run(
            ["pactl", "list", "sinks", "short"],
            capture_output=True,
            text=True,
            env=PULSE_ENV,
        )
        if PULSE_SINK_INPUT in result.stdout:
            print(f"[audio-ws] pipe sink '{PULSE_SINK_INPUT}' already exists", flush=True)
        else:
            subprocess.run(
                [
                    "pactl", "load-module", "module-pipe-sink",
                    f"sink_name={PULSE_SINK_INPUT}",
                    f"file={fifo_path}",
                    "format=s16le",
                    f"rate={int(SAMPLE_RATE)}",
                    f"channels={int(CHANNELS)}",
                ],
                env=PULSE_ENV,
                check=True,
            )
            print(f"[audio-ws] pipe sink '{PULSE_SINK_INPUT}' created", flush=True)
    except subprocess.CalledProcessError as e:
        print(f"[audio-ws] ERROR creating pipe sink: {e}", flush=True)
        return

    # Create a null source for better Chromium compatibility
    try:
        result = subprocess.run(
            ["pactl", "list", "sources", "short"],
            capture_output=True,
            text=True,
            env=PULSE_ENV,
        )
        if PULSE_SOURCE_VIRTUAL not in result.stdout:
            # Create a null source that we'll feed audio into via loopback
            subprocess.run(
                [
                    "pactl", "load-module", "module-null-source",
                    f"source_name={PULSE_SOURCE_VIRTUAL}",
                    "source_properties=device.description=Webcode\\ Microphone",
                ],
                env=PULSE_ENV,
                check=True,
            )
            print(f"[audio-ws] null source '{PULSE_SOURCE_VIRTUAL}' created for Chromium", flush=True)

            # Set up loopback from pipe sink monitor to virtual source
            subprocess.run(
                [
                    "pactl", "load-module", "module-loopback",
                    f"source={PULSE_SINK_INPUT}.monitor",
                    f"sink={PULSE_SOURCE_VIRTUAL}",
                ],
                env=PULSE_ENV,
                check=False,  # May fail if already exists
            )
            print(f"[audio-ws] loopback from '{PULSE_SINK_INPUT}.monitor' to '{PULSE_SOURCE_VIRTUAL}' created", flush=True)
        else:
            print(f"[audio-ws] null source '{PULSE_SOURCE_VIRTUAL}' already exists", flush=True)
    except subprocess.CalledProcessError as e:
        print(f"[audio-ws] WARNING: Could not create null source: {e}", flush=True)
        print(f"[audio-ws] Chromium should use '{PULSE_SINK_INPUT}.monitor' instead", flush=True)

    # Start pacat to write audio data to the pipe sink
    cmd = [
        "pacat", "--playback",
        "-d", PULSE_SINK_INPUT,
        "--format=s16le",
        f"--rate={SAMPLE_RATE}",
        f"--channels={CHANNELS}",
        "--latency-msec=10",
    ]
    pipe_source_proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=PULSE_ENV,
    )
    print(f"[audio-ws] pipe sink pacat started (pid={pipe_source_proc.pid})", flush=True)
    print(f"[audio-ws] Audio input available at: '{PULSE_SOURCE_VIRTUAL}', '{PULSE_SINK_INPUT}.monitor'", flush=True)

    # Monitor stderr for errors
    asyncio.create_task(monitor_pipe_source_stderr(pipe_source_proc))


async def monitor_pipe_source_stderr(proc):
    """Monitor pipe source process stderr."""
    try:
        while True:
            line = await proc.stderr.readline()
            if not line:
                break
            line_str = line.decode().strip()
            if line_str:
                print(f"[audio-ws] pipe source stderr: {line_str}", flush=True)
    except Exception as e:
        print(f"[audio-ws] pipe source stderr monitor error: {e}", flush=True)


async def main():
    if not await wait_for_pulseaudio():
        sys.exit(1)

    await setup_null_sink()
    await wait_for_null_sink()

    # Start pipe source for audio input
    await start_pipe_source()

    async with websockets.serve(handler, HOST, PORT):
        print(f"[audio-ws] WebSocket server listening on ws://{HOST}:{PORT}", flush=True)
        await broadcast_audio()


if __name__ == "__main__":
    asyncio.run(main())
