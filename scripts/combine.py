import sys
from PIL import Image
out=sys.argv[1]; ims=[Image.open(f) for f in sys.argv[2:]]
W=sum(i.width//2 for i in ims); H=max(i.height//2 for i in ims)
s=Image.new('RGB',(W,H),'white'); x=0
for i in ims: s.paste(i.resize((i.width//2,i.height//2)),(x,0)); x+=i.width//2
s.save(out)
