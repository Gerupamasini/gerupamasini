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
warm=(cv2.GaussianBlur(warm.astype(np.float32),(0,0),30)>0.5)&sil   # smooth, clean boundary
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
# clean, uniform stripes: smooth the traced shapes, take their centre lines, redraw at a
# constant width (~28% of the spacing, as in photographs) with soft edges
from skimage.morphology import skeletonize
st=cv2.GaussianBlur(st.astype(np.float32),(0,0),5)>0.45
sk=skeletonize(st)
lab,n=ndi.label(sk,structure=np.ones((3,3))); sizes=ndi.sum(sk,lab,range(1,n+1))
sk=np.isin(lab,1+np.nonzero(sizes>=40)[0])
# prune short side branches (spurs) at junctions
nb=ndi.convolve(sk.astype(np.uint8),np.ones((3,3),np.uint8),mode='constant')-1
junc=sk&(nb>=3)
jd=ndi.binary_dilation(junc,iterations=2)
br=sk&~jd
lab2,n2=ndi.label(br,structure=np.ones((3,3))); sz2=ndi.sum(br,lab2,range(1,n2+1))
ends=sk&(nb==1)
keep=np.zeros_like(sk)
for i in range(1,n2+1):
    m=lab2==i
    if sz2[i-1]>=45 or not (m&ends).any(): keep|=m
sk=keep|(jd&sk&ndi.binary_dilation(keep,iterations=3))
# extend each stripe from its end nearest the yellow field straight on into the yellow
# (in life the rear set continues as thin brown lines up to the soft dorsal base)
ext=np.zeros_like(sk)
nb2=ndi.convolve(sk.astype(np.uint8),np.ones((3,3),np.uint8),mode='constant')-1
eys,exs=np.nonzero(sk&(nb2==1))
warmD=ndi.distance_transform_edt(~warm)          # px to the yellow field
for y0,x0 in zip(eys,exs):
    if warmD[y0,x0]>60 or ss[y0,x0]<0.3: continue
    # local direction from the last ~25 skeleton px
    ys,xs=np.nonzero(sk[max(0,y0-25):y0+26,max(0,x0-25):x0+26])
    ys=ys+max(0,y0-25); xs=xs+max(0,x0-25)
    if len(xs)<8: continue
    d=np.array([x0-xs.mean(),y0-ys.mean()]); n=np.linalg.norm(d)
    if n<3: continue
    d/=n; p=np.array([x0,y0],float)
    q=(p+d*30).astype(int)
    if not (0<=q[0]<W and 0<=q[1]<H) or warmD[q[1],q[0]]>=warmD[y0,x0]-5: continue   # must head into the yellow
    for k in range(0,700):
        p+=d; xi,yi=int(p[0]),int(p[1])
        if not (0<=xi<W and 0<=yi<H) or not sil[yi,xi] or edge[yi,xi]<30: break
        if ss[yi,xi]>0.97: break
        ext[yi,xi]=True
EXT=ext.copy()
skw=sk&~(warm&(ndi.distance_transform_edt(warm)/W*(S1-S0)>0.012))
dsk=ndi.distance_transform_edt(~skw)
HALF=7.5   # px in the 2048-wide painting (spacing ~55 px)
st=dsk<HALF
# distance field to stripe centre lines (1 on the line, 0 at 27 px ~ half the spacing); the
# shader thresholds it: thin stripes on the white, wide ones in the brown zone
# inside the yellow field the front stripes carry on parallel to the white/yellow boundary
# (the dark bands of the dusky zone, with thin yellow gaps between them)
pxu=W/(S1-S0)
_ws=sil&~warm&(ss<0.93)&(edge>15)
bds=cv2.GaussianBlur((ndi.distance_transform_edt(~_ws)/W*(S1-S0)).astype(np.float32),(0,0),45)
dc=np.full_like(bds,1e9)
for k in range(4):
    dc=np.minimum(dc,np.abs(bds-(0.03+0.045*k))*pxu+ (k*6.0))    # later bands fainter (pushed away)
dc=np.where(warm&(edge>18)&(yy>-0.14),dc,1e9)
dsk=np.minimum(dsk,dc)
STRIPE_SOFT=np.clip(1-dsk/36.0,0,1)*np.clip((ss-0.245)/0.02,0,1)*np.clip((1.0-ss)/0.06,0,1)
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
brown=np.clip(1-(bd-0.06)/0.3,0,1)**0.9*warm*np.clip((yy+0.16)/0.06,0,1)*np.clip((0.93-ss)/0.22,0,1)
# thin yellow lines midway between the dusky bands, encoded in the upper half of R
GL=np.zeros_like(bds)
for k in range(3):
    GL=np.maximum(GL,np.clip(1-np.abs(bds-(0.03+0.045*(k+0.5)))*pxu/3.6,0,1)*(1-0.12*k))
GL*=warm*(edge>22)*(yy>-0.14)
R=soft(warm,3)*0.5+0.5*soft(GL,1.0); G=soft(brown,30); B=STRIPE_SOFT; A=soft(blk,2.0)
# pack: R warm, G brown, B stripes, A black; yellow lines in a second tiny channel via G sign trick -> store separately
out=np.stack([R,G,B,A],-1)
# RGB only (browsers drop colour under zero alpha): r = yellow, g = brown (s > 0.32) or eye band (s < 0.32), b = stripes
Gp=np.where(ss<0.32,A,G)
# thin yellow lines parallel to the white/yellow boundary (offset curves of its distance field)
bds=cv2.GaussianBlur(bd.astype(np.float32),(0,0),45)
YL=np.zeros_like(bds)
for k,(d0,a) in enumerate([(0.028,0.9),(0.07,0.75),(0.112,0.55),(0.154,0.35)]):
    YL=np.maximum(YL,a*np.clip(1-np.abs(bds-d0)/0.0035,0,1))
YL*=warm*(edge>22)*np.clip((0.97-ss)/0.05,0,1)*np.clip((yy+0.12)/0.05,0,1)
YL=soft(YL>0.35,1.2)
zone=(soft(warm,3)>0.5)&(G>0.3)
B=B   # stripe distance field   # b<0.5: stripe strength; b>0.5: yellow line (brown zone)
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
