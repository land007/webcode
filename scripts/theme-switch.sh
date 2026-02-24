#!/bin/bash
# Theme switch for GNOME Flashback desktop
export DISPLAY=:1
export XDG_RUNTIME_DIR=/run/user/1000

LIGHT_WALLPAPER="/usr/share/backgrounds/Fuji_san_by_amaral.png"
DARK_WALLPAPER="/usr/share/backgrounds/Numbat_wallpaper_dimmed_3480x2160.png"

case "$1" in
    light|bright)
        hsetroot -cover "$LIGHT_WALLPAPER"
        gsettings set org.gnome.desktop.interface gtk-theme 'Adwaita' 2>/dev/null
        gsettings set org.gnome.desktop.wm.preferences theme 'Adwaita' 2>/dev/null
        gsettings set org.gnome.gnome-panel.general theme-variant 'light' 2>/dev/null
        echo "Light theme applied"
        ;;
    dark)
        hsetroot -cover "$DARK_WALLPAPER"
        gsettings set org.gnome.desktop.interface gtk-theme 'Adwaita-dark' 2>/dev/null
        gsettings set org.gnome.desktop.wm.preferences theme 'Adwaita-dark' 2>/dev/null
        gsettings set org.gnome.gnome-panel.general theme-variant 'dark' 2>/dev/null
        echo "Dark theme applied"
        ;;
    *)
        echo "Usage: theme-switch {light|dark}"
        exit 1
        ;;
esac
