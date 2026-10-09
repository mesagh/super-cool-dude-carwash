// Procedural 3D assets in meters. The axle is local Y; the outside face is +Y.
export function createTire(T, renderer, options) {
  const group = new T.Group();
  group.name = options.name;
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#a0a0a0'; ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = '#303030'; ctx.lineWidth = 9;
  for (const y of [170, 215, 297, 342]) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
  }
  ctx.lineWidth = 4;
  for (let x = -24; x < 1050; x += 24) {
    ctx.beginPath(); ctx.moveTo(x, 128); ctx.lineTo(x + 13, 215);
    ctx.moveTo(x + 13, 297); ctx.lineTo(x, 384); ctx.stroke();
  }
  const bump = new T.CanvasTexture(canvas);
  bump.wrapS = T.RepeatWrapping;
  bump.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const rubber = new T.MeshStandardMaterial({ color: options.color, roughness: 0.94, bumpMap: bump, bumpScale: 0.004 });
  const profile = [[0.211,-0.118],[0.28,-0.123],[0.313,-0.116],[0.33,-0.096],
    [0.336,-0.06],[0.337,0],[0.336,0.06],[0.33,0.096],[0.313,0.116],[0.28,0.123],[0.211,0.118]];
  const tire = new T.Mesh(new T.LatheGeometry(profile.map(p => new T.Vector2(...p)), 96), rubber);
  tire.name = options.name + '-rubber'; tire.castShadow = true;
  group.add(tire);
  // Raised tread shoulders remain dimensional at glancing viewing angles.
  const tread = new T.InstancedMesh(new T.BoxGeometry(0.015, 0.004, 0.032), rubber, 240);
  tread.name = options.name + '-tread'; tread.castShadow = true;
  const transform = new T.Object3D();
  const axis = new T.Vector3(0, 1, 0), normal = new T.Vector3();
  for (let lane = 0; lane < 3; lane++) for (let i = 0; i < 80; i++) {
    const angle = (i + lane * 0.35) / 80 * Math.PI * 2;
    normal.set(Math.cos(angle), 0, Math.sin(angle));
    transform.position.set(normal.x * 0.337, (lane - 1) * 0.047, normal.z * 0.337);
    transform.quaternion.setFromUnitVectors(axis, normal);
    transform.updateMatrix(); tread.setMatrixAt(lane * 80 + i, transform.matrix);
  }
  group.add(tread);
  for (const radius of [0.285, 0.307]) {
    const ring = new T.Mesh(new T.TorusGeometry(radius, 0.002, 6, 96), rubber);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.122; group.add(ring);
  }
  return group;
}

export function createWheel(T, options) {
  const group = new T.Group(); group.name = options.name;
  const alloy = new T.MeshPhysicalMaterial({ color: options.color, metalness: 1, roughness: 0.2, clearcoat: 0.35 });
  const graphite = new T.MeshStandardMaterial({ color: 0x30353a, metalness: 0.85, roughness: 0.32 });
  const dark = new T.MeshStandardMaterial({ color: 0x101214, roughness: 0.85, side: T.DoubleSide });
  const rotor = new T.MeshStandardMaterial({ color: 0x91969a, metalness: 0.9, roughness: 0.4 });
  const caliperMat = new T.MeshPhysicalMaterial({ color: options.caliperColor, metalness: 0.25, roughness: 0.3, clearcoat: 0.7 });
  function add(geometry, material, x = 0, y = 0, z = 0) {
    const mesh = new T.Mesh(geometry, material); mesh.position.set(x,y,z);
    mesh.castShadow = true; group.add(mesh); return mesh;
  }
  add(new T.CylinderGeometry(0.207,0.207,0.22,64,1,true),graphite);
  add(new T.CylinderGeometry(0.202,0.202,0.008,64),dark,0,-0.08);
  const discRadius = options.discRadius;
  add(new T.CylinderGeometry(discRadius,discRadius,0.022,64),rotor);
  const caliper = add(new T.BoxGeometry(0.055,0.05,0.1),caliperMat,-0.11,0.027,-0.085);
  caliper.rotation.y = Math.PI / 4;
  const holeGeo = new T.CircleGeometry(0.0045,8);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 24; i++) {
    const angle = (i + row * 0.5) / 24 * Math.PI * 2, radius = discRadius * (0.7 + row * 0.16);
    const hole = add(holeGeo,dark,Math.cos(angle)*radius,0.0115,Math.sin(angle)*radius);
    hole.rotation.x = -Math.PI / 2;
  }
  const shape = new T.Shape();
  shape.moveTo(-0.009,0.05); shape.lineTo(0.009,0.05);
  shape.lineTo(0.015,0.193); shape.lineTo(-0.015,0.193); shape.closePath();
  const spokeGeo = new T.ExtrudeGeometry(shape,{depth:0.024,bevelEnabled:true,bevelThickness:0.004,bevelSize:0.003,bevelSegments:3});
  spokeGeo.rotateX(-Math.PI/2);
  for (let i = 0; i < 5; i++) for (const offset of [-0.12,0.12]) {
    const spoke = add(spokeGeo,alloy,0,0.061);
    spoke.rotation.y = i / 5 * Math.PI * 2 + offset;
  }
  for (const [radius, thickness, depth] of [[0.203,0.01,0.092],[0.19,0.004,0.08]]) {
    const lip = add(new T.TorusGeometry(radius,thickness,12,96),alloy,0,depth);
    lip.rotation.x = Math.PI/2;
  }
  add(new T.CylinderGeometry(0.049,0.056,0.035,32),graphite,0,0.076);
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * Math.PI * 2;
    add(new T.CylinderGeometry(0.008,0.008,0.016,6),alloy,Math.cos(angle)*0.067,0.09,Math.sin(angle)*0.067);
  }
  const valve = add(new T.CylinderGeometry(0.004,0.004,0.019,8),dark,0.173,0.098,0);
  valve.rotation.z = 0.3;
  return group;
}
