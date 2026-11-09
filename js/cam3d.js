/* cam3d.js — cámara de agujero (pinhole), portada de Vóley TV (view3d.js). Sin DOM: se prueba en Node.
 * El motor trabaja en 0..1; acá se pasa a metros de una cancha de fútbol 7 (60 × 40 m).
 * Mundo: x = largo (azul ataca hacia +x), y = ancho (hacia la cámara de TV), z = arriba. Mirando hacia +x, tu derecha es +y.
 */
(function (g) {
  'use strict';
  const F7 = g.F7, NEAR = 0.1, L = 60, W = 40;

  const toM = (p, z) => ({ x: p.x * L, y: p.y * W, z: z != null ? z : (p.z || 0) });
  const fromM = p => ({ x: p.x / L, y: p.y / W });

  function camera(eye, look, fovDeg, rect) {
    let fx = look.x - eye.x, fy = look.y - eye.y, fz = look.z - eye.z;
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    let rx = -fy, ry = fx; const rl = Math.hypot(rx, ry) || 1; rx /= rl; ry /= rl;
    const ux = -ry * fz, uy = rx * fz, uz = ry * fx - rx * fy; // arriba, perpendicular y con z > 0
    const focal = (rect.h / 2) / Math.tan((fovDeg * Math.PI) / 360);
    return { eye, f: { x: fx, y: fy, z: fz }, r: { x: rx, y: ry, z: 0 }, u: { x: ux, y: uy, z: uz }, focal, cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2, rect };
  }
  function toCam(c, p) {
    const dx = p.x - c.eye.x, dy = p.y - c.eye.y, dz = (p.z || 0) - c.eye.z;
    return { X: dx * c.r.x + dy * c.r.y, Y: dx * c.u.x + dy * c.u.y + dz * c.u.z, Z: dx * c.f.x + dy * c.f.y + dz * c.f.z };
  }
  const projC = (c, q) => ({ x: c.cx + (c.focal * q.X) / q.Z, y: c.cy - (c.focal * q.Y) / q.Z, d: q.Z });
  function proj(c, p) { const q = toCam(c, p); return q.Z < NEAR ? null : projC(c, q); }
  function clipPoly(c, pts) {
    const cs = pts.map(p => toCam(c, p)), out = [];
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i], b = cs[(i + 1) % cs.length], ai = a.Z >= NEAR, bi = b.Z >= NEAR;
      if (ai) out.push(a);
      if (ai !== bi) { const t = (NEAR - a.Z) / (b.Z - a.Z); out.push({ X: a.X + (b.X - a.X) * t, Y: a.Y + (b.Y - a.Y) * t, Z: NEAR }); }
    }
    return out.map(q => projC(c, q));
  }
  function clipSeg(c, a, b) {
    let A = toCam(c, a), B = toCam(c, b);
    if (A.Z < NEAR && B.Z < NEAR) return null;
    if (A.Z < NEAR) { const t = (NEAR - A.Z) / (B.Z - A.Z); A = { X: A.X + (B.X - A.X) * t, Y: A.Y + (B.Y - A.Y) * t, Z: NEAR }; }
    if (B.Z < NEAR) { const t = (NEAR - B.Z) / (A.Z - B.Z); B = { X: B.X + (A.X - B.X) * t, Y: B.Y + (A.Y - B.Y) * t, Z: NEAR }; }
    return [projC(c, A), projC(c, B)];
  }
  // del toque en la pantalla al punto del piso (en metros)
  function unprojFloor(c, sx, sy) {
    const X = (sx - c.cx) / c.focal, Y = -(sy - c.cy) / c.focal;
    const dx = c.f.x + c.r.x * X + c.u.x * Y, dy = c.f.y + c.r.y * X + c.u.y * Y, dz = c.f.z + c.u.z * Y;
    if (dz >= -1e-4) return null;
    const t = -c.eye.z / dz;
    return { x: c.eye.x + dx * t, y: c.eye.y + dy * t };
  }

  F7.cam = { L, W, NEAR, toM, fromM, camera, toCam, proj, clipPoly, clipSeg, unprojFloor };
})(typeof window !== 'undefined' ? window : globalThis);
