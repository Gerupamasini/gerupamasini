import { DataTexture, LinearFilter, LinearMipmapLinearFilter } from 'three';
import { Rng } from '../../core/Rng';

/** Original leaf-cluster cutouts. RG carries each tiny leaf's own UV, A its antialiased outline.
 * Sixteen irregular compositions, not a repeating leaf grid. No photographs are embedded. */
let pixels: Uint8Array | null = null;
export function createLeafAtlas(): DataTexture {
  const tileSize=128, size=tileSize*4;
  if(!pixels) {
    pixels=new Uint8Array(size*size*4);
    for(let tile=0;tile<16;tile++) {
      const rng=new Rng(93011+tile*811), tier=tile<8?1:2, count=tier===1?9:18;
      const offsetX=(tile%4)*tileSize,offsetY=Math.floor(tile/4)*tileSize;
      for(let i=0;i<count;i++) {
        const cx=rng.range(0.2,0.8),cy=rng.range(0.2,0.8),angle=rng.range(-Math.PI,Math.PI),c=Math.cos(angle),s=Math.sin(angle);
        const w=tier===1?rng.range(0.145,0.19):rng.range(0.08,0.125),h=tier===1?rng.range(0.17,0.23):rng.range(0.105,0.16);
        const radius=Math.hypot(w,h),x0=Math.max(0,Math.floor((cx-radius)*tileSize)),x1=Math.min(tileSize-1,Math.ceil((cx+radius)*tileSize));
        const y0=Math.max(0,Math.floor((cy-radius)*tileSize)),y1=Math.min(tileSize-1,Math.ceil((cy+radius)*tileSize));
        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
          const dx=(x+0.5)/tileSize-cx,dy=(y+0.5)/tileSize-cy;
          const u=(dx*c+dy*s)/(2*w)+0.5,v=(-dx*s+dy*c)/(2*h)+0.5;
          if(v<=0 || v>=1)continue;
          const width=Math.pow(Math.sin(v*Math.PI),0.7)*0.49,margin=width-Math.abs(u-0.5);
          const alpha=Math.max(0,Math.min(1,margin*w*tileSize+0.5));
          const k=((offsetY+y)*size+offsetX+x)*4;
          if(alpha*255<=pixels[k+3])continue;
          pixels[k]=Math.round(Math.max(0,Math.min(1,u))*255);pixels[k+1]=Math.round(v*255);pixels[k+2]=0;pixels[k+3]=Math.round(alpha*255);
        }
      }
    }
  }
  const texture=new DataTexture(pixels,size,size);texture.name='YaeyamaHirugi/OriginalLeafClusters';
  texture.magFilter=LinearFilter;texture.minFilter=LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}
