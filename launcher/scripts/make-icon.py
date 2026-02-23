import struct, zlib, pathlib

def make_png(w, h, r, g, b):
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    row = b'\x00' + bytes([r,g,b]*w)
    raw = zlib.compress(row * h, 9)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', raw) + chunk(b'IEND', b'')

pathlib.Path('launcher/assets/icon.png').write_bytes(make_png(1024,1024,0,127,153))
print('icon.png created')
