#!/bin/sh
# Setup desktop components
# This script configures all desktop-related files and services

set -e

echo "Setting up desktop components..."

# Copy supervisor configs
cp /tmp/supervisor-audio.conf /etc/supervisor/conf.d/
cp /tmp/supervisor-dashboard.conf /etc/supervisor/conf.d/

# Copy dashboard files
cp /tmp/dashboard-server.js /opt/
cp /tmp/dashboard.html /opt/

# Copy audio server scripts
cp /tmp/audio-ws-server.py /opt/
cp /tmp/audio-ws-wrapper.sh /opt/
chmod +x /opt/audio-ws-server.py /opt/audio-ws-wrapper.sh

# Copy noVNC audio player HTML
cp /tmp/audio-player.html /opt/noVNC/audio.html
cp /tmp/audio-bar.js /opt/noVNC/audio-bar.js
cp /tmp/touch-handler.js /opt/noVNC/touch-handler.js

# Fix noVNC HTML to include scripts
awk '/<head>/ { print; print "    <meta charset=\"UTF-8\">"; next }
     /<\/body>/ { print "<script src=\"touch-handler.js\"></script>"; print "<script src=\"audio-bar.js\"></script>"; print; next }
     { print }' /opt/noVNC/vnc.html > /opt/noVNC/vnc.html.tmp
mv /opt/noVNC/vnc.html.tmp /opt/noVNC/vnc.html

# Copy xsession
cp /tmp/xsession /opt/xsession
chmod +x /opt/xsession

# Copy desktop shortcuts
cp -r /tmp/desktop-shortcuts/ /opt/

echo "Desktop components setup complete!"
