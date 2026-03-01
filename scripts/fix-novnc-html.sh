#!/bin/sh
# Fix noVNC HTML for desktop components
# This script adds necessary scripts and meta tags to vnc.html

set -e

VNC_HTML="/opt/noVNC/vnc.html"

# Add UTF-8 meta tag after <head>
sed -i '/<head>/a\    <meta charset="UTF-8">' "$VNC_HTML"

# Add audio-bar.js script before </body>
sed -i 's|</body>|<script src="audio-bar.js"></script>|' "$VNC_HTML"
sed -i '/<script src="audio-bar.js"><\/script>/a\</body>' "$VNC_HTML"

# Add touch-handler.js script before </body>
sed -i 's|</body>|<script src="touch-handler.js"></script>|' "$VNC_HTML"
sed -i '/<script src="touch-handler.js"><\/script>/a\</body>' "$VNC_HTML"
