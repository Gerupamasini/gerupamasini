# Overlay an orthographic render (pixel-aligned with the rectified photo) on the photo.
# usage: python3 tools/overlay.py rect.png render.png out.jpg
import sys, numpy as np, cv2
a=cv2.imread(sys.argv[1]); b=cv2.imread(sys.argv[2]); b=cv2.resize(b,(a.shape[1],a.shape[0]))
side=np.concatenate([a,b],1)
mix=(0.5*a+0.5*b).astype(np.uint8)
# render silhouette edge in red over the photo
g=cv2.cvtColor(b,cv2.COLOR_BGR2GRAY); bg=np.median(g[:20,:20])
m=(np.abs(g.astype(int)-bg)>12).astype(np.uint8)*255
m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
cnts,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
edge=a.copy(); cv2.drawContours(edge,cnts,-1,(0,0,255),3)
top=np.concatenate([edge,mix],1)
out=np.concatenate([side,top],0)
cv2.imwrite(sys.argv[3],cv2.resize(out,(out.shape[1]//2,out.shape[0]//2)),[cv2.IMWRITE_JPEG_QUALITY,85])
