#!/bin/sh
# Fix noVNC HTML for desktop components
# This script adds necessary scripts and meta tags to vnc.html

set -e

VNC_HTML="/opt/noVNC/vnc.html"

# Use awk for reliable multi-line text insertion
awk '
/<head>/ {
    print
    print "    <meta charset=\"UTF-8\">"
    next
}
/<\/body>/ {
    # Insert scripts before </body> in reverse order
    print "<script src=\"touch-handler.js\"></script>"
    print "<script src=\"audio-bar.js\"></script>"
    print
    next
}
{ print }
' "$VNC_HTML" > "$VNC_HTML.tmp" && mv "$VNC_HTML.tmp" "$VNC_HTML"
