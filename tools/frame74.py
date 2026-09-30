import numpy as np, glob, json
from PIL import Image
SN=np.array([1430.,715.]); PED=np.array([380.,457.])
L=np.linalg.norm(PED-SN); u=(PED-SN)/L; v=np.array([u[1],-u[0]])
if v[1]>0: v=-v
def to_fish(P):
    P=np.asarray(P,float)-SN; return np.stack([P@u/L, P@v/L],-1)
def to_img(sy):
    sy=np.asarray(sy,float); return SN+np.outer(sy[...,0],u).reshape(sy.shape[:-1]+(2,))*L+np.outer(sy[...,1],v).reshape(sy.shape[:-1]+(2,))*L
# traced outline (orig px), clockwise from snout over the top
top=[(1430,715),(1425,700),(1400,670),(1350,625),(1320,600),(1315,570),(1305,530),(1295,490),(1285,445),(1270,405),(1250,370),(1225,345),(1200,320),(1175,300),(1150,287),(1100,265),(1050,245),(1000,230),(950,217),(900,205),(850,200),(800,195),(750,192),(700,187),(650,184),(600,182),(550,185),(500,187),(450,195),(400,205),(340,220),(327,230)]
rear_d=[(327,230),(330,275),(350,325),(370,365),(395,402)]
anal=[(365,512),(300,540),(265,570),(250,600),(260,630),(280,650),(325,685),(375,710),(450,735),(500,755),(575,775),(650,787),(750,800),(850,805),(900,824),(975,825),(1025,822),(1075,815),(1125,805),(1175,790),(1225,775),(1275,760),(1325,740),(1375,730),(1410,722),(1430,715)]
caud=[(395,402),(225,297),(200,350),(185,450),(200,550),(205,575),(365,512)]
out={k:to_fish(np.array(p)).round(4).tolist() for k,p in dict(top=top,rear_d=rear_d,anal=anal,caud=caud,ocellus=[(420,240)],filament=[(327,225),(150,290)],band_top=[(1285,605)],band=[(1250,610),(1315,625),(1300,740),(1180,770)]).items()}
if __name__=='__main__':
    print('L',L,'u',u,'v',v)
    for k,val in out.items(): print(k, val)
    json.dump(out,open('outline74.json','w'))
