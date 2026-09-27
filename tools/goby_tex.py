# Warp the CC0 fire-goby photo (iNaturalist 419949786) onto the model's painting space with a
# thin-plate spline through matched landmarks (outline, fin edges, eye), then white-balance.
import numpy as np, cv2
from scipy.interpolate import RBFInterpolator
S0,S1,Y0,Y1=-0.03,1.3,-0.52,0.6
def spline(pts):
    pts=np.array(pts,float)
    def f(s):
        if s<=pts[0,0]: return pts[0,1]
        if s>=pts[-1,0]: return pts[-1,1]
        i=np.searchsorted(pts[:,0],s)-1; n=len(pts)
        p0,p1,p2,p3=pts[max(i-1,0)],pts[i],pts[i+1],pts[min(i+2,n-1)]
        t=(s-p1[0])/(p2[0]-p1[0]); m1=(p2[1]-p0[1])/(p2[0]-p0[0])*(p2[0]-p1[0]); m2=(p3[1]-p1[1])/(p3[0]-p1[0])*(p2[0]-p1[0])
        t2,t3=t*t,t*t*t
        return (2*t3-3*t2+1)*p1[1]+(t3-2*t2+t)*m1+(-2*t3+3*t2)*p2[1]+(t3-t2)*m2
    return f
top=spline([[0,0.01],[0.01,0.034],[0.03,0.062],[0.06,0.088],[0.1,0.108],[0.15,0.12],[0.25,0.132],[0.4,0.13],[0.6,0.112],[0.8,0.084],[0.93,0.062],[1.0,0.05]])
bot=spline([[0,-0.01],[0.012,-0.024],[0.04,-0.038],[0.09,-0.05],[0.16,-0.057],[0.25,-0.06],[0.4,-0.06],[0.6,-0.055],[0.8,-0.048],[0.93,-0.04],[1.0,-0.036]])
def resample(P,n):
    P=np.array(P,float); d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(P,axis=0),axis=1))]
    t=np.linspace(0,d[-1],n); return np.stack([np.interp(t,d,P[:,0]),np.interp(t,d,P[:,1])],1)
N=40
mU=[(s,top(s)) for s in np.linspace(0,0.40,12)]+[(0.41,0.152),(0.55,0.16),(0.7,0.148),(0.85,0.118),(0.97,0.088),(1.03,0.066),(1.1,0.06),(1.19,0.05),(1.24,0.01)]
mL=[(s,bot(s)) for s in np.linspace(0,0.46,12)]+[(0.47,-0.075),(0.6,-0.085),(0.75,-0.088),(0.9,-0.082),(0.99,-0.07),(1.05,-0.074),(1.12,-0.078),(1.2,-0.068),(1.24,-0.03),(1.24,0.01)]
# photo 6 (iNaturalist 31740129, CC BY): true side view on black; traced outline, original px
pU=[(378,835),(390,790),(430,755),(500,732),(600,718),(695,705),(800,695),(930,700),(1050,720),(1110,740),(1180,780),(1280,850),(1370,930),(1470,1010),(1570,1060),(1640,1095),(1670,1120),(1640,1180)]
pL=[(378,835),(382,855),(410,885),(470,912),(550,935),(620,950),(750,970),(850,995),(930,1030),(950,1090),(1050,1130),(1150,1150),(1250,1160),(1350,1170),(1450,1220),(1500,1260),(1580,1230),(1640,1180)]
mU,mL,pU,pL=[resample(x,N) for x in (mU,mL,pU,pL)]
src=[];dst=[]
for f in (0.25,0.5,0.75):
    src.append(mU*(1-f)+mL*f); dst.append(pU*(1-f)+pL*f)
src=np.concatenate(src); dst=np.concatenate(dst)
keep=src[:,0]>0.22                      # interior pairs near the head conflict with the eye landmark
src=np.concatenate([mU,mL[1:-1],src[keep],[[0.07,0.042]]]); dst=np.concatenate([pU,pL[1:-1],dst[keep],[[480,815]]])
_, ui = np.unique(np.round(src, 5), axis=0, return_index=True); src, dst = src[np.sort(ui)], dst[np.sort(ui)]
# outward ring so the warp stays sane just outside the outline
cU=mU.mean(0)
rbf=RBFInterpolator(src,dst,kernel='thin_plate_spline',smoothing=1e-6)
W=1536; H=int(round(W*(Y1-Y0)/(S1-S0)))
ss,yy=np.meshgrid(np.linspace(S0,S1,W),np.linspace(Y1,Y0,H))
P=rbf(np.stack([ss.ravel(),yy.ravel()],1)).reshape(H,W,2).astype(np.float32)
im=cv2.imread('goby3/o6.jpeg')
# which painting pixels really sample the fish in the photo (not the background behind folded fins)
psil=np.zeros(im.shape[:2],np.uint8)
cv2.fillPoly(psil,[np.concatenate([pU,pL[::-1]]).astype(np.int32)],255)
psil=cv2.erode(psil,np.ones((7,7),np.uint8))
tex=cv2.remap(im,P[...,0],P[...,1],cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE).astype(np.float32)/255
valid=cv2.remap(psil,P[...,0],P[...,1],cv2.INTER_NEAREST,borderValue=0)>0
_ref=(ss>0.18)&(ss<0.4)&(yy>0.0)&(yy<0.09)
_wb=tex*(tex[_ref].mean(0).mean()/tex[_ref].mean(0))
Bc,Gc,Rc=_wb[...,0],_wb[...,1],_wb[...,2]
bg=(0.3*Rc+0.6*Gc+0.1*Bc<np.where(ss>0.95,0.025,0.09))
bg=cv2.dilate(bg.astype(np.uint8),np.ones((9,9),np.uint8))>0
valid&=~bg
# fill the rest (taller model fins) by extending the fish's own colours outward
t8=(np.clip(tex,0,1)*255).astype(np.uint8)
small=cv2.resize(t8,(W//2,H//2)); vm=cv2.resize((~valid).astype(np.uint8)*255,(W//2,H//2),interpolation=cv2.INTER_NEAREST)
small=cv2.inpaint(small,vm,15,cv2.INPAINT_TELEA)
fill=cv2.GaussianBlur(cv2.resize(small,(W,H)),(0,0),3).astype(np.float32)/255
vs=cv2.GaussianBlur(valid.astype(np.float32),(0,0),3)[...,None]
tex=tex*vs+fill*(1-vs)
# model silhouette (body + median fins) in painting space
px=lambda A: np.stack([(A[:,0]-S0)/(S1-S0)*(W-1),(Y1-A[:,1])/(Y1-Y0)*(H-1)],1)
sil=np.zeros((H,W),np.uint8); cv2.fillPoly(sil,[np.concatenate([px(mU),px(mL[::-1])]).astype(np.int32)],255)
# white balance: the pale mid body (s 0.18-0.4, near the midline) should read pearl grey
lin=lambda x: np.where(x<=0.04045,x/12.92,((x+0.055)/1.055)**2.4)
enc=lambda x: np.where(x<=0.0031308,x*12.92,1.055*np.power(np.clip(x,0,None),1/2.4)-0.055)
Lt=lin(tex)
ref=(ss>0.18)&(ss<0.4)&(yy>0.0)&(yy<0.09)
target=lin(np.array([0.84,0.82,0.79]))    # BGR of pearl grey
gain=target/Lt[ref].mean(0)
Lt=Lt*gain
# lift overall exposure moderately and flatten large-scale shading on the body
lum=0.0722*Lt[...,0]+0.7152*Lt[...,1]+0.2126*Lt[...,2]
m=(sil>0).astype(np.float32)
bl=cv2.GaussianBlur(lum*m,(0,0),60)/np.maximum(cv2.GaussianBlur(m,(0,0),60),1e-3)
Lt=Lt/np.maximum(bl,1e-3)[...,None]**0.5*np.median(bl[sil>0])**0.5
out=np.clip(enc(np.clip(Lt,0,1)),0,1)
# head: lime-yellow rather than mint (the photo's green cast survives white balance there)
hk=np.clip((0.2-ss)/0.08,0,1)[...,None]*np.clip((out[...,2]-out[...,0])/0.2,0,1)[...,None]
out=out*(1-hk*0.7)+np.clip(out*np.array([0.66,1.02,0.96]),0,1)*hk*0.7     # head: lemon-lime
# rear: the dark caudal and the fin tips read maroon-black in life; re-tone by luminance
tk=np.clip((ss-0.88)/0.12,0,1)[...,None]
Lg=np.clip(out.mean(-1,keepdims=True)*1.6,0,1)
maroon=np.array([0.03,0.03,0.1])+Lg*np.array([0.05,0.07,0.28])        # BGR
out=out*(1-tk)+maroon*tk
# red zone: a little less neon
g=out.mean(-1,keepdims=True); rk=np.clip((out[...,2]-out[...,1])/0.3,0,1)[...,None]
out=np.clip(out*(1-0.05*rk)+g*0.05*rk,0,1)
# the 3D eye sits here: replace the (warped) photographed eye with the surrounding head colour
ec=px(np.array([[0.07,0.042]]))[0]; er=int(0.052/(S1-S0)*W)
em=np.zeros((H,W),np.uint8); cv2.circle(em,(int(ec[0]),int(ec[1])),er,255,-1)
o8=(out*255).astype(np.uint8); o8=cv2.inpaint(o8,em,9,cv2.INPAINT_TELEA); out=o8.astype(np.float32)/255
alpha=cv2.GaussianBlur(sil,(0,0),2)
cv2.imwrite('goby_photo.png',np.dstack([(out*255).astype(np.uint8),alpha]))
prev=np.where(sil[...,None]>0,out*255,40).astype(np.uint8)
cv2.imwrite('goby_photo_prev.jpg',prev[int(H*0.25):int(H*0.75),:])
print('gain',np.round(gain,2),W,H)
print('eye maps to', rbf(np.array([[0.07,0.042]])), 'snout', rbf(np.array([[0.0,0.0]])))
print('px of eye in tex', px(np.array([[0.07,0.042]])))
dx=np.gradient(P[...,0],axis=1); dy=np.gradient(P[...,1],axis=0); dxy=np.gradient(P[...,0],axis=0); dyx=np.gradient(P[...,1],axis=1)
det=dx*dy-dxy*dyx
print('folded fraction in sil', ((det>0)&(sil>0)).mean()/max((sil>0).mean(),1e-9), 'det sign typical', np.sign(np.median(det[sil>0])))
for s_ in [0.0,0.03,0.07,0.12,0.2]:
    for y_ in [-0.03,0.0,0.04,0.08]:
        print(s_,y_,np.round(rbf(np.array([[s_,y_]]))[0]))
