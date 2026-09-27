import numpy as np, cv2
from scipy import ndimage as ndi
S0,S1,Y0,Y1=-0.03,1.3,-0.52,0.6
rect=cv2.imread('rect74.png'); sil=cv2.imread('sil74.png',0)>0
H,W=sil.shape
ss=np.linspace(S0,S1,W)[None,:].repeat(H,0); yy=np.linspace(Y1,Y0,H)[:,None].repeat(W,1)
edge=ndi.distance_transform_edt(sil)                      # px from the outline
hsv=cv2.cvtColor(rect,cv2.COLOR_BGR2HSV).astype(np.float32)
h,s,v=hsv[...,0],hsv[...,1]/255,hsv[...,2]/255
g=cv2.GaussianBlur(cv2.cvtColor(rect,cv2.COLOR_BGR2GRAY).astype(np.float32)/255,(0,0),2)
def clean(m,open_=2,close=2,minarea=400):
    m=ndi.binary_opening(m,iterations=open_) if open_ else m
    m=ndi.binary_closing(m,iterations=close) if close else m
    lab,n=ndi.label(m); sizes=ndi.sum(m,lab,range(1,n+1))
    keep=np.isin(lab,1+np.nonzero(sizes>=minarea)[0]); return keep
# --- warm (yellow/orange) region
warm=(s>0.38)&(h>6)&(h<38)&sil
warm=clean(warm,2,6,3000); warm=ndi.binary_fill_holes(warm)
# fins at the very rear are warm even where photo is washed out
warm|=sil&(ss>1.0)
warm=(cv2.GaussianBlur(warm.astype(np.float32),(0,0),12)>0.5)&sil   # smooth, clean boundary
# --- neutral black
blk=(v<0.3)&(s<0.55)&sil&(edge>4)
blk=clean(blk,1,5,300); blk=ndi.binary_fill_holes(blk)
blk&=(ss<0.3)   # keep the eye band only; ocellus and fin margins are drawn procedurally
blk=clean(blk,0,8,3000); blk=ndi.binary_fill_holes(blk)
blk=cv2.GaussianBlur(blk.astype(np.float32),(0,0),9)>0.5   # smooth outline, as in life
blk&=~((ss>0.3)&(ss<0.95)&(yy<0.28))      # stripes/brown zone are handled separately
# --- stripes: thin dark lines on the white, and continuing as brown chevrons into the warm zone
lmax=cv2.GaussianBlur(cv2.dilate(g,np.ones((35,35),np.uint8)),(0,0),10)
rel=g/np.maximum(lmax,1e-3)
st=(rel<0.8)&sil&(edge>np.where(yy<-0.1,40,18))&(ss>0.245)&(ss<0.97)&~blk
st&=~(warm&(ndi.distance_transform_edt(warm)/W*(S1-S0)>0.2))
st&=~(warm&(edge<35))
st&=~(warm&(ss>0.93))
st&=~((ss<0.3)&(yy<0.02))
st=clean(st,1,1,600)
st=ndi.binary_erosion(st,iterations=3)   # photo stripes are ~1/3 of the spacing
# --- brown amount inside the warm region (smooth), and the bright yellow lines inside it
lum=cv2.GaussianBlur(v,(0,0),7)
brown=np.clip((0.6-lum)/0.33,0,1)*warm
dog=cv2.GaussianBlur(g,(0,0),2)-cv2.GaussianBlur(g,(0,0),8)
hue_y=(h>18)&(h<34)&(s>0.5)
ylines=(dog>0.02)&hue_y&warm&(edge>25)&(ss<0.93)&(ss>0.3)
ylines=clean(ylines,0,1,250)
def soft(m,sig): return cv2.GaussianBlur(m.astype(np.float32),(0,0),sig)
# brown zone: a clean gradient measured inward from the white/yellow boundary
dist_in=ndi.distance_transform_edt(warm)/W*(S1-S0)       # fish units
white_side=sil&~warm&(ss<0.93)&(edge>15)
bd=ndi.distance_transform_edt(~white_side)/W*(S1-S0)      # distance to the white region
# brown: darkest along the white boundary, fading to orange ~0.3 body lengths behind it
brown=np.clip(1-(bd-0.05)/0.25,0,1)**1.3*warm*np.clip((yy+0.16)/0.06,0,1)*np.clip((0.93-ss)/0.22,0,1)
R=soft(warm,3); G=soft(brown,26); B=soft(st,1.6); A=soft(blk,2.0)
# pack: R warm, G brown, B stripes, A black; yellow lines in a second tiny channel via G sign trick -> store separately
out=np.stack([R,G,B,A],-1)
# RGB only (browsers drop colour under zero alpha): r = yellow, g = brown (s > 0.32) or eye band (s < 0.32), b = stripes
Gp=np.where(ss<0.32,A,G)
# thin yellow lines parallel to the white/yellow boundary (offset curves of its distance field)
bds=cv2.GaussianBlur(bd.astype(np.float32),(0,0),45)
YL=np.zeros_like(bds)
for k,(d0,a) in enumerate([(0.03,1.0),(0.075,0.8),(0.12,0.55)]):
    YL=np.maximum(YL,a*np.clip(1-np.abs(bds-d0)/0.0035,0,1))
YL*=warm*(edge>22)*np.clip((0.97-ss)/0.05,0,1)*np.clip((yy+0.12)/0.05,0,1)
YL=soft(YL>0.35,1.2)
zone=(soft(warm,3)>0.5)&(G>0.3)
B=np.where(zone,0.5+0.5*np.clip(YL,0,1),B*0.49)   # b<0.5: stripe strength; b>0.5: yellow line (brown zone)
rgb=np.stack([R,Gp,B],-1)
cv2.imwrite('auriga_pattern.png',(np.clip(rgb,0,1)*255).astype(np.uint8)[...,::-1])
cv2.imwrite('auriga_ylines.png',(np.clip(soft(ylines,1.5),0,1)*255).astype(np.uint8))
# preview
white=np.array([0.93,0.92,0.95]); Y=np.array([1.0,0.76,0.0]); Bc=np.array([0.33,0.17,0.04]); K=np.array([0.04,0.035,0.04]); ink=np.array([0.12,0.1,0.12])
wa,br,sp,bk=[out[...,i][...,None] for i in range(4)]; yl=soft(ylines,1.5)[...,None]
warmCol=Y*(1-br)+Bc*br; warmCol=warmCol*(1-yl)+np.array([1,0.88,0.15])*yl
col=white*(1-wa)+warmCol*wa
col=col*(1-sp)+(ink*(1-wa)+Bc*0.6*wa)*sp
col=col*(1-bk)+K*bk
col[~sil]=0.15
cv2.imwrite('clean74_small.jpg',cv2.resize((col[...,::-1]*255).astype(np.uint8),(1024,H//2)))
