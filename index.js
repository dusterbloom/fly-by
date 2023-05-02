import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.5.23/+esm'
import SimplexNoise from 'https://cdn.skypack.dev/simplex-noise@3.0.0';
import * as stats from 'https://cdn.skypack.dev/three-stats'

const container = document.querySelector('.container');
const canvas    = document.querySelector('.canvas');

let
sizes,
scene,
camera,
renderer,
controls,
raycaster,
distance,
capsule,
centerTile,
simplex,
maxHeight,
snowHeight,
lightSnowHeight,
rockHeight,
forestHeight,
lightForestHeight,
grassHeight,
sandHeight,
shallowWaterHeight,
waterHeight,
deepWaterHeight,
textures,
terrainTiles,
statsPanel;

let 
currentPos,
currentLookAt;


const setScene = async () => {

  sizes = {
    width:  container.offsetWidth,
    height: container.offsetHeight
  };

  scene   = new THREE.Scene();

  camera  = new THREE.PerspectiveCamera(60, sizes.width / sizes.height, 1, 1000);
  camera.position.set(0, 40, 40);
  
  renderer = new THREE.WebGLRenderer({
    canvas:     canvas,
    antialias:  false,
    alpha:      true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5));
  const pointLight = new THREE.PointLight(new THREE.Color("#FFCB8E").convertSRGBToLinear().convertSRGBToLinear(), 10, 120);
  pointLight.position.set(10, 50, 70);
  pointLight.castShadow = true;
  scene.add(pointLight);

  centerTile = {
    xFrom:  -10,
    xTo:    10,
    yFrom:  -10,
    yTo:    10
  }
  simplex               = new SimplexNoise();
  maxHeight             = 10;
  snowHeight            = maxHeight * 0.9;
  lightSnowHeight       = maxHeight * 0.8;
  rockHeight            = maxHeight * 0.7;
  forestHeight          = maxHeight * 0.6;
  lightForestHeight     = maxHeight * 0.5;
  grassHeight           = maxHeight * 0.4;
  sandHeight            = maxHeight * 0.3;
  shallowWaterHeight    = maxHeight * 0.2;
  waterHeight           = maxHeight * 0.1;
  deepWaterHeight       = maxHeight * 0;
  textures              = {
    snow:         new THREE.Color(0xE5E5E5),
    lightSnow:    new THREE.Color(0x73918F),
    rock:         new THREE.Color(0x2A2D10),
    forest:       new THREE.Color(0x224005),
    lightForest:  new THREE.Color(0x367308),
    grass:        new THREE.Color(0x98BF06),
    sand:         new THREE.Color(0xE3F272),
    shallowWater: new THREE.Color(0x3EA9BF),
    water:        new THREE.Color(0x00738B),
    deepWater:    new THREE.Color(0x015373)
  };
  terrainTiles = [];

  setControls();
  setRaycast();
  setThirdPersonCam();
  setSphere();
  createTile();
  resize();
  listenTo();
  showStats();
  render();

  console.log(camera.position);

}

const setControls = () => {
  controls                 = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping   = true;
}

const setRaycast = () => {
  THREE.BufferGeometry.prototype.computeBoundsTree  = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree  = disposeBoundsTree;
  THREE.Mesh.prototype.raycast                      = acceleratedRaycast;

  raycaster = new THREE.Raycaster();
  distance  = 3;
  raycaster.firstHitOnly = true;
}

const setThirdPersonCam = () => {

  currentPos    = new THREE.Vector3();
  currentLookAt = new THREE.Vector3();

}

const calcIdealOffset = () => {

  const idealOffset = new THREE.Vector3(3, 9, 16);
  idealOffset.add(capsule.position)
  return idealOffset;

}

const calcIdealLookat = () => {

  const idealLookat = new THREE.Vector3(0, -5, -25);
  idealLookat.add(capsule.position)
  return idealLookat;

}

const thirdPersonCamUpdate = () => {

  const idealOffset = calcIdealOffset();
  const idealLookat = calcIdealLookat();

  const t = 0.05;
  currentPos.lerp(idealOffset, t);
  currentLookAt.lerp(idealLookat, t);

  camera.position.copy(currentPos);
  camera.lookAt(currentLookAt);

}

const setSphere = () => {

  const geo     = new THREE.CapsuleGeometry(1, 1, 4, 14); 
  const mat     = new THREE.MeshBasicMaterial({color: 0x000000}); 
  capsule       = new THREE.Mesh(geo, mat); 

  capsule.position.set(0, 10, 0);
  geo.computeBoundsTree();
  scene.add(capsule);

}

const createTile = () => {

  const tileToPosition = (tileX, height, tileY) => {
    return new THREE.Vector3((tileX + (tileY % 2) * 0.5) * 1.68, height / 2, tileY * 1.535);
  }

  const setHexMesh = (geo) => {

    const mat   = new THREE.MeshStandardMaterial();
    const mesh  = new THREE.InstancedMesh(geo, mat, 441);

    mesh.castShadow     = true;
    mesh.receiveShadow  = true;
  
    return mesh;

  }

  const manipulator = new THREE.Object3D();
  const geo         = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
  const mesh        = setHexMesh(geo);
  geo.computeBoundsTree();
  terrainTiles.push(mesh);
  
  let counter = 0;
  for(let i = centerTile.xFrom; i <= centerTile.xTo; i++) {
    for(let j = centerTile.yFrom; j <= centerTile.yTo; j++) {

      let noise     = (simplex.noise2D(i * 0.04, j * 0.04) + 1) * 0.5;
      noise         = Math.pow(noise, 1.5);
      const height  = noise * maxHeight;

      manipulator.scale.y = height;

      const pos = tileToPosition(i, height, j);
      manipulator.position.set(pos.x, pos.y, pos.z);

      manipulator.updateMatrix();
      mesh.setMatrixAt(counter, manipulator.matrix);

      if(height > snowHeight)               mesh.setColorAt(counter, textures.snow);
      else if(height > lightSnowHeight)     mesh.setColorAt(counter, textures.lightSnow);
      else if(height > rockHeight)          mesh.setColorAt(counter, textures.rock);
      else if(height > forestHeight)        mesh.setColorAt(counter, textures.forest);
      else if(height > lightForestHeight)   mesh.setColorAt(counter, textures.lightForest);
      else if(height > grassHeight)         mesh.setColorAt(counter, textures.grass);
      else if(height > sandHeight)          mesh.setColorAt(counter, textures.sand);
      else if(height > shallowWaterHeight)  mesh.setColorAt(counter, textures.shallowWater);
      else if(height > waterHeight)         mesh.setColorAt(counter, textures.water);
      else if(height > deepWaterHeight)     mesh.setColorAt(counter, textures.deepWater);

      counter++;

    }
  }

  scene.add(mesh);

}

const resize = () => {

  sizes = {
    width:  container.offsetWidth,
    height: container.offsetHeight
  };

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);

}

const keyDown = (event) => {
 
  if (event.keyCode == '38') { // up arrow
    centerTile.yFrom -= 21;
    centerTile.yTo -= 21;
  }
  else if (event.keyCode == '40') { // down arrow
    centerTile.yFrom += 21;
    centerTile.yTo += 21;
  }
  else if (event.keyCode == '37') { // left arrow
    centerTile.xFrom -= 21;
    centerTile.xTo -= 21;
  }
  else if (event.keyCode == '39') { // right arrow
    centerTile.xFrom += 21;
    centerTile.xTo += 21;
  }

  if (event.keyCode == '87') { // w
    capsule.position.z -= 2;
    calcCamHeight();
  }
  else if (event.keyCode == '83') { // s
    capsule.position.z += 2;
    calcCamHeight();
  }
  else if (event.keyCode == '65') { // a
    capsule.position.x -= 2;
    calcCamHeight();
  }
  else if (event.keyCode == '68') { // d
    capsule.position.x += 2;
    calcCamHeight();
  }

  createTile();
  
}

const calcCamHeight = () => {

  // https://stackoverflow.com/questions/17443056/threejs-keep-object-on-surface-of-another-object
  raycaster.set(capsule.position, new THREE.Vector3(0, -1, 0));

  var intersects = raycaster.intersectObjects(terrainTiles);

  if (distance > intersects[0].distance) capsule.position.y += (distance - intersects[0].distance) - 1;
  else capsule.position.y -= intersects[0].distance - distance;
  
}

const listenTo = () => {
  window.addEventListener('resize', resize.bind(this));
  window.addEventListener('keydown', keyDown.bind(this));
}

const showStats = () => {
  statsPanel = new stats.Stats();
  statsPanel.showPanel(0);
  document.body.appendChild(statsPanel.dom);
}

const render = () => {

  statsPanel.begin();
  controls.update();
  thirdPersonCamUpdate();
  renderer.render(scene, camera);
  statsPanel.end();

  requestAnimationFrame(render.bind(this))

}

setScene();