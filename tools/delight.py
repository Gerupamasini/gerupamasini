# Build a de-lit, colour-corrected albedo of Chaetodon auriga in painting space from the
# rectified CC0 photograph (iNaturalist 67560751).
import numpy as np, cv2
from scipy import ndimage as ndi
S0,S1,Y0,Y1=-0.03,1.3,-0.52,0.6
rect=cv2.imread('rect74.png').astype(np.float32)/255     # BGR, painting space
sil=cv2.imread('sil74.png',0)>0
H,W=sil.shape
pat=cv2.imread('auriga_pattern.png').astype(np.float32)/255
R,G,B=pat[...,2],pat[...,1],pat[...,0]
ss=np.linspace(S0,S1,W)[None,:].repeat(H,0)
lin=lambda x: np.where(x<=0.04045,x/12.92,((x+0.055)/1.055)**2.4)
enc=lambda x: np.where(x<=0.0031308,x*12.92,1.055*np.power(np.clip(x,0,None),1/2.4)-0.055)
P=lin(rect)
# regions from the traced masks
Y=np.clip((R-0.1)/0.3,0,1); stripe=np.clip((B-0.63)/0.14,0,1); band=np.where(ss<0.32,G,0)
white=(Y<0.1)&(stripe<0.1)&(band<0.1)&sil&(ss>0.25)
yel=(Y>0.9)&(np.where(ss<0.32,0,G)<0.1)&(stripe<0.1)&sil
er=cv2.erode(sil.astype(np.uint8),np.ones((15,15),np.uint8))>0
white&=er; yel&=er
# target reflectances (linear) for white and yellow
tW=lin(np.array([0.86,0.87,0.87])[::-1]); tY=lin(np.array([1.0,0.76,0.05])[::-1])
# 1) shading: smooth ratio photo/target over the white and yellow regions (normalized convolution)
lum=lambda c: 0.0722*c[...,0]+0.7152*c[...,1]+0.2126*c[...,2]
ratio=np.zeros((H,W),np.float32); wgt=np.zeros((H,W),np.float32)
ratio[white]=lum(P)[white]/lum(tW[None,None,:])[0,0]; wgt[white]=1
sig=110
num=cv2.GaussianBlur(ratio*wgt,(0,0),sig); den=cv2.GaussianBlur(wgt,(0,0),sig)
shade=num/np.maximum(den,1e-4)
shade=np.where(den>1e-3,shade,np.median(ratio[wgt>0]))
A=P/np.maximum(shade[...,None],1e-3)
# 2) colour correction: separate per-channel gains for the white and the yellow field,
#    blended by the traced yellow mask
gW=np.array([tW[c]/A[...,c][white].mean() for c in range(3)])
gY=np.clip(np.array([tY[c]/A[...,c][yel].mean() for c in range(3)]),0.85,1.2)
gY=gY/gY.max()*min(1.15,gY.max())
Ys=cv2.GaussianBlur(Y,(0,0),6)[...,None]
A=A*(gW[None,None,:]*(1-Ys)+gY[None,None,:]*Ys)
gains=(gW,gY)
A=np.clip(A,0,1)
out=enc(A)
# sand leaking in along the traced outline: where the photo is far from the expected colour
# within 45 px of the edge, fall back to the expected (mask-painted) colour
expW=enc(tW)[None,None,:]; expY=enc(lin(np.array([0.98,0.6,0.08])[::-1]))[None,None,:]
exp_=expW*(1-Ys)+expY*Ys
edgeD=ndi.distance_transform_edt(sil)
mx=out.max(-1); mn=out.min(-1); sat=(mx-mn)/np.maximum(mx,1e-3); lo=lum(out)
bad=(sat<0.3)&(lo>0.3)&(lo<0.85)&(Ys[...,0]>0.5)&(edgeD<60)   # grey sand inside the yellow outline
yy=np.linspace(Y1,Y0,H)[:,None].repeat(W,1)
bad|=(ss>0.9)&(yy>0.14)          # rear dorsal corner: a pebble behind the fin in the photo; ocellus is drawn procedurally
bad=cv2.dilate(bad.astype(np.uint8),np.ones((9,9),np.uint8))>0
# fill those pixels from the surrounding photo (inpainting keeps the photographic texture)
o8=(np.clip(out,0,1)*255).astype(np.uint8)
o8=cv2.inpaint(o8,bad.astype(np.uint8)*255,21,cv2.INPAINT_TELEA)
noise=(np.random.default_rng(1).normal(0,3.0,o8.shape)*bad[...,None]).astype(np.float32)
out=np.clip(o8.astype(np.float32)+noise,0,255)/255
# the white field is bluish from the water in the photo: pull its chroma toward neutral
g=lum(out)[...,None]
wmask=(1-Ys)*(1-cv2.GaussianBlur(stripe,(0,0),3)[...,None]*0.5)
out=out*(1-0.55*wmask)+g*0.55*wmask
# dusky zone: the photo's water cast turns it olive; re-tint by luminance to the real
# brown-black -> yellow ramp (the thin bright lines stay bright yellow)
Brz=cv2.GaussianBlur(np.where(ss<0.32,0,G),(0,0),4)[...,None]
L=lum(out)[...,None]
t=np.clip((L-0.1)/0.75,0,1)**1.5
ramp=np.where(t<0.5, enc(lin(np.array([0.12,0.07,0.03])[::-1]))*(1-t*2)+enc(lin(np.array([0.55,0.3,0.05])[::-1]))*(t*2),
              enc(lin(np.array([0.55,0.3,0.05])[::-1]))*(2-t*2)+enc(lin(np.array([1.0,0.82,0.1])[::-1]))*(t*2-1))
k=np.clip(Brz*3.0+0.35,0,1)*Ys*(1-np.clip((ss[...,None]-0.9)/0.1,0,1))
out=out*(1-k)+ramp*k
# eye band: crush to near black (de-lighting lifted it to grey)
bz=cv2.GaussianBlur(band,(0,0),3)[...,None]
out=out*(1-bz*0.8)+np.array([0.05,0.045,0.05])*bz*0.8
# light local-contrast cleanup: remove JPEG blockiness a little
out=cv2.bilateralFilter((out*255).astype(np.uint8),5,20,5)
# alpha = silhouette (soft), fins keep full alpha here; the shader decides membrane opacity
alpha=cv2.GaussianBlur(cv2.erode(sil.astype(np.uint8)*255,np.ones((5,5),np.uint8)),(0,0),2)
rgba=np.dstack([out,alpha])
cv2.imwrite('auriga_photo.png',rgba)
cv2.imwrite('auriga_photo_prev.jpg',cv2.resize(np.where(sil[...,None],out,40).astype(np.uint8),(1024,864))[150:680,0:950])
print('gains',[np.round(g,2) for g in gains])
