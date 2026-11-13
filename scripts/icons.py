"""Convert Blender-rendered PNG icons (assets/icons-png/*.png from build_assets.py) to webp in src/assets/icons."""
import glob, os
from PIL import Image
os.makedirs('src/assets/icons', exist_ok=True)
for f in glob.glob('assets/icons-png/*.png'):
    Image.open(f).save('src/assets/icons/' + os.path.basename(f)[:-4] + '.webp', 'WEBP', quality=88, method=6)
