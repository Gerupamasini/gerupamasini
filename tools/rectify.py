import numpy as np, glob, json, cv2
from frame74 import to_img, out
S0,S1,Y0,Y1=-0.03,1.3,-0.52,0.6
W=2048; H=int(round(W*(Y1-Y0)/(S1-S0)/16)*16)
im=cv2.imread(glob.glob('ref2/o74.*')[0])
ss=np.linspace(S0,S1,W); yy=np.linspace(Y1,Y0,H)   # row 0 = top (y = Y1)
Sg,Yg=np.meshgrid(ss,yy)
P=to_img(np.stack([Sg,Yg],-1))
rect=cv2.remap(im,P[...,0].astype(np.float32),P[...,1].astype(np.float32),cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
cv2.imwrite('rect74.png',rect)
# silhouette polygon in painting pixels
def px(pts): pts=np.array(pts); return np.stack([(pts[:,0]-S0)/(S1-S0)*(W-1),(Y1-pts[:,1])/(Y1-Y0)*(H-1)],-1)
poly=np.concatenate([px(out['top']),px(out['rear_d']),px(out['caud'][1:-1][::-1][::-1]),px(out['anal'])])
sil=np.zeros((H,W),np.uint8)
body=np.concatenate([px(out['top']),px(out['rear_d']),px([out['caud'][0]]+out['caud'][1:6]+[out['caud'][6]]),px(out['anal'])])
cv2.fillPoly(sil,[body.astype(np.int32)],255)
cv2.imwrite('sil74.png',sil)
vis=rect.copy(); cv2.polylines(vis,[body.astype(np.int32)],True,(0,0,255),3)
cv2.imwrite('rect74_vis.jpg',cv2.resize(vis,(1024,H//2)))
print(W,H)
