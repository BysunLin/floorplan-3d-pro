/* 花架 · 3D（单位米；原点 = 占地中心，y=0 为地面）
 * 总高 = h：立柱占 h-0.23，顶部留给花盆与枝叶。 */
export default function build({ w, d, h, c, cyl, rbox, blob, mat, woodM, THREE }){
  const g = new THREE.Group();
  const wood = woodM(c);
  const inset = .045, postR = .017;
  const postH = h - .23;

  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    g.add(cyl(postR, postR, postH, wood, sx*(w/2 - inset), 0, sz*(d/2 - inset), 10));

  for (const t of [.36, .96])
    g.add(rbox(w - .05, .022, d - .05, wood, 0, postH*t, 0, .006));

  const potY = postH*.96 + .022;
  g.add(cyl(.085, .065, .15, mat('#c98f6f', { roughness: .85 }), 0, potY, 0, 20));
  g.add(blob(.13, .07, .13, mat('#8fae74', { roughness: .9 }), 0, potY + .21, 0, 18));
  return g;
}
