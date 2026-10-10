import { DataTexture, LinearFilter, LinearMipmapLinearFilter } from 'three';
import { Rng } from '../../core/Rng';

/** Original twig-tuft cutouts for far foliage cards: 4-6 Rhizophora rosettes per tile, each 6-8 leaves
 * radiating from a shoot tip. RG carries each leaf's own UV, A its antialiased outline. No photographs embedded. */
let pixels: Uint8Array | null = null;
export function createLeafAtlas(): DataTexture {
  const tileSize=128, size=tileSize*4;
  if(!pixels) {
    pixels=new Uint8Array(size*size*4);
    for(let tile=0;tile<16;tile++) {
      const rng=new Rng(93011+tile*811), offsetX=(tile%4)*tileSize, offsetY=Math.floor(tile/4)*tileSize;
      const rosettes=rng.int(4,6);
      for(let r=0;r<rosettes;r++) {
        // Rosettes sit higher on the card than its base, like shoot tips above the twig.
        const ox=rng.range(0.24,0.76), oy=rng.range(0.3,0.75), rot=rng.range(0,Math.PI*2), n=rng.int(6,8);
        for(let i=0;i<n;i++) {
          const angle=rot+i/n*Math.PI*2+rng.range(-0.25,0.25), c=Math.cos(angle), s=Math.sin(angle);
          const h=rng.range(0.11,0.17), w=h*rng.range(0.42,0.5), cx=ox+c*h*0.55, cy=oy+s*h*0.55;
          stamp(offsetX,offsetY,cx,cy,angle-Math.PI/2,w,h);
        }
      }
    }
  }
  function stamp(offsetX:number,offsetY:number,cx:number,cy:number,angle:number,w:number,h:number) {
    const c=Math.cos(angle),s=Math.sin(angle),radius=Math.hypot(w,h)*0.6;
    const x0=Math.max(0,Math.floor((cx-radius)*tileSize)),x1=Math.min(tileSize-1,Math.ceil((cx+radius)*tileSize));
    const y0=Math.max(0,Math.floor((cy-radius)*tileSize)),y1=Math.min(tileSize-1,Math.ceil((cy+radius)*tileSize));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
      const dx=(x+0.5)/tileSize-cx,dy=(y+0.5)/tileSize-cy;
      const u=(dx*c+dy*s)/w+0.5,v=(-dx*s+dy*c)/h+0.5;
      if(v<=0 || v>=1)continue;
      const width=Math.pow(Math.sin(v*Math.PI),0.62)*0.49,margin=width-Math.abs(u-0.5);
      const alpha=Math.max(0,Math.min(1,margin*w*tileSize+0.5));
      const k=((offsetY+y)*size+offsetX+x)*4;
      if(alpha*255<=pixels![k+3])continue;
      pixels![k]=Math.round(Math.max(0,Math.min(1,u))*255);pixels![k+1]=Math.round(v*255);pixels![k+2]=0;pixels![k+3]=Math.round(alpha*255);
    }
  }
  const texture=new DataTexture(pixels,size,size);texture.name='YaeyamaHirugi/OriginalTwigTufts';
  texture.magFilter=LinearFilter;texture.minFilter=LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}
