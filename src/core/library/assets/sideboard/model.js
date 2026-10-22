/* 玄关条案 · 3D（单位米；原点 = 占地中心，y=0 为地面，正面朝 +z） */
export default function build({ w, d, h, c, box, rbox, cyl, mat, woodM, darker, THREE }){
  const g = new THREE.Group();
  const top = woodM('#c8a97e');
  const body = mat(c, { roughness: .72 });
  const seam = mat(darker(c, .7), { roughness: .8 });
  const legH = .14, topH = .04;
  const bodyH = Math.max(.1, h - legH - topH);

  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    g.add(cyl(.016, .022, legH, top, sx*(w/2 - .07), 0, sz*(d/2 - .06), 10));

  g.add(rbox(w - .04, bodyH, d - .03, body, 0, legH, 0, .012));
  g.add(box(.014, bodyH - .06, .012, seam, 0, legH + .03, d/2 - .022));
  for (const sx of [-1, 1])
    g.add(box(.02, .14, .02, seam, sx*.09, legH + bodyH*.55, d/2 - .012));

  g.add(rbox(w, topH, d, top, 0, legH + bodyH, 0, .01));
  return g;
}
