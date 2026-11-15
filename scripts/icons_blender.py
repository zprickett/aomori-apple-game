"""Convert assets/icons-png/*.png to src/assets/icons/*.webp using Blender (no Pillow needed).

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/icons_blender.py
"""
import glob
import os
import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(ROOT, 'assets', 'icons-png')
dst = os.path.join(ROOT, 'src', 'assets', 'icons')
os.makedirs(dst, exist_ok=True)
scene = bpy.context.scene
s = scene.render.image_settings
s.file_format = 'WEBP'
s.color_mode = 'RGBA'
s.quality = 88
n = 0
for f in sorted(glob.glob(os.path.join(src, '*.png'))):
    img = bpy.data.images.load(f)
    out = os.path.join(dst, os.path.basename(f)[:-4] + '.webp')
    img.save_render(out, scene=scene)
    bpy.data.images.remove(img)
    n += 1
print('converted', n)
