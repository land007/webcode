#!/usr/bin/env python3
"""PulseAudio null-sink -> WebSocket audio stream
Supports both PCM (s16le, 44100Hz, stereo) and Opus (64 Kbps VBR) codecs.
Full-duplex: also accepts inbound binary messages from browser mic and writes
them into a webcode_input null-sink via pacat --playback.
Text frames: JSON control messages for server-side ffmpeg recording.
"""
import asyncio
import os
import subprocess
import sys
import websockets
import json
import signal
import datetime
import struct

HOST = "127.0.0.1"
PORT = 10006
SAMPLE_RATE = 44100
CHANNELS = 2
CHUNK_SIZE = 16384  # ~186ms per chunk (16384 / (44100 * 2))
PULSE_SINK = "webcode_null"
PULSE_INPUT_SINK = "webcode_input"
CLIENTS = set()
CLIENTS_CODEC = {}  # ws -> 'pcm' or 'opus'

# Frame types for message framing
FRAME_TYPE_PCM = 0x0000
FRAME_TYPE_OPUS = 0x0001

# PulseAudio socket path
PULSE_SOCKET = "/run/user/1000/pulse/native"
PULSE_ENV = {**os.environ, "PULSE_SERVER": f"unix:{PULSE_SOCKET}"}

# pacat --playback subprocess for microphone input
pacat_in_proc = None

# ffmpeg recording state
ffmpeg_proc = None
recording_filename = None
RECORDINGS_DIR = "/home/ubuntu/recordings"

# Opus encoder subprocess
opus_encoder_proc = None
opus_encoder_stdin = None
opus_encoder_stdout = None


def _get_display_resolution(display):
    """Query actual X11 display size via xdpyinfo (avoids VNC_RESOLUTION mismatch)."""
    import re
    try:
        result = subprocess.run(
            ["xdpyinfo", "-display", display],
            capture_output=True, text=True, timeout=3,
            env={**os.environ, "DISPLAY": display},
        )
        m = re.search(r'dimensions:\s+(\d+x\d+)', result.stdout)
        if m:
            return m.group(1)
    except Exception:
        pass
    # fallback to env var
    vnc_res = os.environ.get("VNC_RESOLUTION", "1920x1080")
    if not re.match(r'^\d+x\d+$', vnc_res):
        vnc_res = "1920x1080"
    return vnc_res


def _build_ffmpeg_cmd(filename):
    display = os.environ.get("DISPLAY", ":1")
    res = _get_display_resolution(display)
    print(f"[audio-ws] Recording resolution: {res}", flush=True)
    return [
        "ffmpeg", "-y",
        "-f", "x11grab", "-framerate", "30",
        "-video_size", res,
        "-i", f"{display}.0+0,0",
        "-f", "pulse", "-i", f"{PULSE_SINK}.monitor",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        filename,
    ]


async def start_recording():
    global ffmpeg_proc, recording_filename
    if ffmpeg_proc is not None and ffmpeg_proc.returncode is None:
        return None, "already_recording"
    os.makedirs(RECORDINGS_DIR, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    recording_filename = os.path.join(RECORDINGS_DIR, f"recording_{ts}.mp4")
    cmd = _build_ffmpeg_cmd(recording_filename)
    print(f"[audio-ws] Starting recording: {recording_filename}", flush=True)
    try:
        ffmpeg_proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**PULSE_ENV, "DISPLAY": os.environ.get("DISPLAY", ":1")},
        )
        asyncio.ensure_future(_drain_ffmpeg_stderr())
        return recording_filename, None
    except Exception as e:
        ffmpeg_proc = None
        recording_filename = None
        return None, str(e)


async def _drain_ffmpeg_stderr():
    if not ffmpeg_proc:
        return
    try:
        while True:
            line = await ffmpeg_proc.stderr.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="replace").strip()
            if text and not text.startswith("frame="):
                print(f"[ffmpeg] {text}", flush=True)
    except Exception:
        pass


async def stop_recording():
    global ffmpeg_proc, recording_filename
    if ffmpeg_proc is None or ffmpeg_proc.returncode is not None:
        return None, "not_recording"
    fname = recording_filename
    try:
        ffmpeg_proc.send_signal(signal.SIGINT)
        try:
            await asyncio.wait_for(ffmpeg_proc.wait(), timeout=10.0)
        except asyncio.TimeoutError:
            ffmpeg_proc.kill()
            await ffmpeg_proc.wait()
        print(f"[audio-ws] Recording saved: {fname}", flush=True)
    except Exception as e:
        return None, str(e)
    finally:
        ffmpeg_proc = None
        recording_filename = None
    return fname, None


async def start_opus_encoder():
    """Start FFmpeg Opus encoder subprocess."""
    global opus_encoder_proc, opus_encoder_stdin, opus_encoder_stdout
    cmd = [
        "ffmpeg", "-y",
        "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS),
        "-i", "pipe:0",
        "-c:a", "libopus",
        "-application", "voip",
        "-frame_duration", "5",
        "-b:a", "64k",
        "-vbr", "on",
        "-f", "opus",
        "pipe:1"
    ]
    opus_encoder_proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=PULSE_ENV,
    )
    opus_encoder_stdin = opus_encoder_proc.stdin
    opus_encoder_stdout = opus_encoder_proc.stdout
    print(f"[audio-ws] Opus encoder started (pid={opus_encoder_proc.pid})", flush=True)
    asyncio.ensure_future(_drain_opus_stderr())


async def _drain_opus_stderr():
    """Drain Opus encoder stderr to avoid blocking."""
    if not opus_encoder_proc:
        return
    try:
        while True:
            line = await opus_encoder_proc.stderr.readline()
            if not line:
                break
    except Exception:
        pass


def make_frame(frame_type, payload):
    """Create a framed message with header."""
    header = struct.pack('>HH', frame_type, len(payload))
    return header + payload


async def broadcast_audio():
    """Read audio from pacat, encode to Opus, and broadcast to all WebSocket clients."""
    # Start Opus encoder
    await start_opus_encoder()

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
        # Tasks for reading PCM and Opus streams
        pcm_task = asyncio.create_task(read_pcm_and_encode(proc))
        opus_task = asyncio.create_task(read_opus_frames())

        # Wait for either task to complete (both should run indefinitely)
        done, pending = await asyncio.wait(
            [pcm_task, opus_task],
            return_when=asyncio.FIRST_COMPLETED
        )

        # Cancel remaining tasks
        for task in pending:
            task.cancel()

    except Exception as e:
        print(f"[audio-ws] broadcast_audio error: {e}", flush=True)
    finally:
        try:
            proc.terminate()
            await proc.wait()
        except Exception:
            pass
        try:
            if opus_encoder_proc:
                opus_encoder_proc.terminate()
                await opus_encoder_proc.wait()
        except Exception:
            pass


async def read_pcm_and_encode(pacat_proc):
    """Read PCM frames from pacat, send to PCM clients, and feed Opus encoder."""
    try:
        while True:
            data = await pacat_proc.stdout.read(CHUNK_SIZE)
            if not data:
                break

            # Send to PCM clients
            pcm_clients = [ws for ws, codec in CLIENTS_CODEC.items() if codec == 'pcm']
            if pcm_clients:
                frame = make_frame(FRAME_TYPE_PCM, data)
                dead = set()
                for ws in pcm_clients:
                    try:
                        await ws.send(frame)
                    except Exception as e:
                        print(f"[audio-ws] PCM send to client failed: {e}", flush=True)
                        dead.add(ws)
                CLIENTS.difference_update(dead)
                for ws in dead:
                    CLIENTS_CODEC.pop(ws, None)

            # Feed Opus encoder
            if opus_encoder_stdin and not opus_encoder_stdin.is_closing():
                try:
                    opus_encoder_stdin.write(data)
                    await opus_encoder_stdin.drain()
                except Exception as e:
                    print(f"[audio-ws] Opus encoder write error: {e}", flush=True)
    except Exception as e:
        print(f"[audio-ws] read_pcm_and_encode error: {e}", flush=True)


async def read_opus_frames():
    """Read Opus frames from encoder and send to Opus clients."""
    if not opus_encoder_stdout:
        return

    try:
        # Opus OGG page size for 5ms frame at 44.1kHz stereo is variable
        # Read small chunks to get individual frames
        while True:
            # Read OGG page header (at least 27 bytes)
            header = await opus_encoder_stdout.read(27)
            if not header or len(header) < 27:
                break

            # Check OGG magic
            if header[:4] != b'OggS':
                # Not an OGG page, skip and try again
                continue

            # Get page segments count
            page_segments = header[26]
            segment_table = await opus_encoder_stdout.read(page_segments)
            if len(segment_table) < page_segments:
                break

            total_len = sum(segment_table[i] for i in range(page_segments))
            if total_len == 0 or total_len > 65535:
                continue

            # Read the payload (contains Opus packet with OGG layer)
            payload = await opus_encoder_stdout.read(total_len)
            if len(payload) < total_len:
                break

            # Extract Opus packet from OGG page
            # Skip OGG segment headers (first byte of each segment)
            opus_packet = b''
            pos = 0
            for i in range(page_segments):
                seg_len = segment_table[i]
                if seg_len > 0 and pos + seg_len <= len(payload):
                    # Skip the first byte if it's the OGG segment header
                    packet_data = payload[pos:pos + seg_len]
                    # Check if this looks like an Opus packet (TOC byte)
                    if len(packet_data) > 0 and (packet_data[0] & 0xF8) != 0:
                        opus_packet += packet_data
                    pos += seg_len

            if not opus_packet:
                continue

            # Send to Opus clients only
            opus_clients = [ws for ws, codec in CLIENTS_CODEC.items() if codec == 'opus']
            if opus_clients:
                frame = make_frame(FRAME_TYPE_OPUS, opus_packet)
                dead = set()
                for ws in opus_clients:
                    try:
                        await ws.send(frame)
                    except Exception as e:
                        print(f"[audio-ws] Opus send to client failed: {e}", flush=True)
                        dead.add(ws)
                CLIENTS.difference_update(dead)
                for ws in dead:
                    CLIENTS_CODEC.pop(ws, None)
    except Exception as e:
        print(f"[audio-ws] read_opus_frames error: {e}", flush=True)


async def handler(ws):
    """Handle WebSocket client connection (full-duplex)."""
    CLIENTS.add(ws)
    # Default to Opus for new clients
    CLIENTS_CODEC[ws] = 'opus'
    print(f"[audio-ws] client connected ({len(CLIENTS)} total) from {ws.remote_address}", flush=True)
    try:
        async for message in ws:
            if isinstance(message, bytes):
                if pacat_in_proc and pacat_in_proc.stdin:
                    try:
                        pacat_in_proc.stdin.write(message)
                        await pacat_in_proc.stdin.drain()
                    except Exception as e:
                        print(f"[audio-ws] mic input write error: {e}", flush=True)
            elif isinstance(message, str):
                try:
                    msg = json.loads(message)
                except json.JSONDecodeError:
                    continue

                # Handle codec negotiation
                if msg.get("version") == 2 and "codec" in msg:
                    requested_codec = msg["codec"].lower()
                    if requested_codec in ("pcm", "opus"):
                        old_codec = CLIENTS_CODEC.get(ws, 'opus')
                        CLIENTS_CODEC[ws] = requested_codec
                        print(f"[audio-ws] client {ws.remote_address} codec: {old_codec} -> {requested_codec}", flush=True)
                    continue

                action = msg.get("action")
                if action == "start_recording":
                    fname, err = await start_recording()
                    resp = {"event": "recording_error", "error": err} if err else \
                           {"event": "recording_started", "filename": os.path.basename(fname)}
                elif action == "stop_recording":
                    fname, err = await stop_recording()
                    resp = {"event": "recording_error", "error": err} if err else \
                           {"event": "recording_stopped", "filename": os.path.basename(fname)}
                elif action == "recording_status":
                    is_rec = ffmpeg_proc is not None and ffmpeg_proc.returncode is None
                    resp = {"event": "recording_status", "recording": is_rec,
                            "filename": os.path.basename(recording_filename) if recording_filename else None}
                else:
                    continue
                try:
                    await ws.send(json.dumps(resp))
                except Exception:
                    pass
    except Exception:
        pass
    finally:
        CLIENTS.discard(ws)
        CLIENTS_CODEC.pop(ws, None)
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
    import atexit

    def _cleanup():
        if ffmpeg_proc and ffmpeg_proc.returncode is None:
            try:
                ffmpeg_proc.send_signal(signal.SIGINT)
            except Exception:
                pass

    atexit.register(_cleanup)

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
