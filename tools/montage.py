import sys
from PIL import Image
for k in sys.argv[1:]:
    a=Image.open(f'refs/ref_{k}.jpg').convert('RGB'); b=Image.open(f'shots/r_{k}.png').convert('RGB')
    h=560; a=a.resize((int(a.width*h/a.height),h)); b=b.resize((int(b.width*h/b.height),h))
    m=Image.new('RGB',(a.width+b.width+6,h),'white'); m.paste(a,(0,0)); m.paste(b,(a.width+6,0)); m.save(f'shots/cmp_{k}.jpg',quality=90)
