import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
currentPos,
currentLookAt,
capsule,
gltfLoader,
grassMeshes,
treeMeshes,
centerTile,
tileWidth,
amountOfHexInTile,
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
activeTile,
statsPanel;

const setScene = async () => {

  sizes = {
    width:  container.offsetWidth,
    height: container.offsetHeight
  };

  scene             = new THREE.Scene();
  scene.background  = new THREE.Color(0xcccccc);
  scene.fog         = new THREE.Fog(0xcccccc, 50, 130);

  camera  = new THREE.PerspectiveCamera(60, sizes.width / sizes.height, 1, 200);
  camera.position.set(0, 40, 40);
  
  renderer = new THREE.WebGLRenderer({
    canvas:     canvas,
    antialias:  false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputEncoding = THREE.sRGBEncoding;

  scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5));

  gltfLoader = new GLTFLoader();
  centerTile = {
    xFrom:  -25,
    xTo:    25,
    yFrom:  -25,
    yTo:    25
  };
  tileWidth             = 50;
  amountOfHexInTile     = Math.pow((centerTile.xTo + 1) - centerTile.xFrom, 2); // +1 accounts for 0
  simplex               = new SimplexNoise();
  maxHeight             = 30;
  snowHeight            = maxHeight * 0.9;
  lightSnowHeight       = maxHeight * 0.8;
  rockHeight            = maxHeight * 0.7;
  forestHeight          = maxHeight * 0.6;
  lightForestHeight     = maxHeight * 0.4;
  grassHeight           = maxHeight * 0.3;
  sandHeight            = maxHeight * 0.2;
  shallowWaterHeight    = maxHeight * 0.14;
  waterHeight           = maxHeight * 0.08;
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

  setRaycast();
  // setControls();
  setCapsule();
  await setGrass();
  await setTrees();
  setThirdPersonCam();
  createTile();
  createSurroundingTiles('{"x":-25,"y":-25}');
  calcCapsulePos();
  resize();
  listenTo();
  showStats();
  render();

}

const setRaycast = () => {

  THREE.BufferGeometry.prototype.computeBoundsTree  = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree  = disposeBoundsTree;
  THREE.Mesh.prototype.raycast                      = acceleratedRaycast;

  raycaster = new THREE.Raycaster();
  distance  = 4
  raycaster.firstHitOnly = true;

}

const setControls = () => {
  controls                 = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping   = true;
}

const setCapsule = () => {

  const geo = new THREE.CapsuleGeometry(1, 1, 4, 14); 
  const mat = new THREE.MeshBasicMaterial({color: 0x000000}); 
  capsule   = new THREE.Mesh(geo, mat); 

  capsule.position.set(0, 10, 0);
  geo.computeBoundsTree();
  scene.add(capsule);

}

const setGrass = async () => {

  grassMeshes           = {};
  const model           = await gltfLoader.loadAsync('img/grass/scene.gltf');
  const grassMeshNames  = [
    {
      varName:  'grassMeshOne',
      meshName: 'Circle015_Grass_0'
    },
    {
      varName:  'grassMeshTwo',
      meshName: 'Circle018_Grass_0'
    }
  ];

  for(let i = 0; i < grassMeshNames.length; i++) {
    const mesh  = model.scene.getObjectByName(grassMeshNames[i].meshName);
    const geo   = mesh.geometry.clone();
    const mat   = mesh.material.clone();
    grassMeshes[grassMeshNames[i].varName] = new THREE.InstancedMesh(geo, mat, amountOfHexInTile / 2);
  }

  return;

}

const setTrees = async () => {

  treeMeshes          = {};
  const treeMeshNames = [
    {
      varName:    'treeMeshOne',
      modelPath:  'img/trees/pine/scene.gltf',
      meshName:   'Cylinder_0'
    },
    {
      varName:    'treeMeshTwo',
      modelPath:  'img/trees/twisted-branches/scene.gltf',
      meshName:   'Tree_winding_01_Material_0'
    }
  ];

  for(let i = 0; i < treeMeshNames.length; i++) {
    const model  = await gltfLoader.loadAsync(treeMeshNames[i].modelPath);
    console.log(model);
    const mesh  = model.scene.getObjectByName(treeMeshNames[i].meshName);
    const geo   = mesh.geometry.clone();
    const mat   = mesh.material.clone();
    treeMeshes[treeMeshNames[i].varName]   = new THREE.InstancedMesh(geo, mat, amountOfHexInTile / 2);
    console.log('treeMeshes[treeMeshNames[i].varName].mesh:', treeMeshes[treeMeshNames[i].varName]);
  }

  return;

}

const setThirdPersonCam = () => {
  currentPos    = new THREE.Vector3();
  currentLookAt = new THREE.Vector3();
}

const createSurroundingTiles = (newActiveTile) => {

  const setCenterTile = (parsedCoords) => {
    centerTile = {
      xFrom:  parsedCoords.x,
      xTo:    parsedCoords.x + tileWidth,
      yFrom:  parsedCoords.y,
      yTo:    parsedCoords.y + tileWidth
    }
  }

  const parsedCoords = JSON.parse(newActiveTile);

  setCenterTile(parsedCoords);

  tileYNegative();

  tileXPositive();

  tileYPositive();
  tileYPositive();

  tileXNegative();
  tileXNegative();

  tileYNegative();
  tileYNegative();

  setCenterTile(parsedCoords);

  cleanUp();

  activeTile = newActiveTile;

}

const tileYNegative = () => {
  centerTile.yFrom -= tileWidth;
  centerTile.yTo -= tileWidth;
  createTile();
}
const tileYPositive = () => {
  centerTile.yFrom += tileWidth;
  centerTile.yTo += tileWidth;
  createTile();
}
const tileXNegative = () => {
  centerTile.xFrom -= tileWidth;
  centerTile.xTo -= tileWidth;
  createTile();
}
const tileXPositive = () => {
  centerTile.xFrom += tileWidth;
  centerTile.xTo += tileWidth;
  createTile();
}

const createTile = () => {

  const tileName = JSON.stringify({
    x: centerTile.xFrom,
    y: centerTile.yFrom
  });

  if(terrainTiles.some(el => el.name === tileName)) return; // Returns if tile already exists

  const tileToPosition = (tileX, height, tileY) => {
    return new THREE.Vector3((tileX + (tileY % 2) * 0.5) * 1.68, height / 2, tileY * 1.535);
  }

  const setHexMesh = (geo) => {

    const mat   = new THREE.MeshStandardMaterial();
    const mesh  = new THREE.InstancedMesh(geo, mat, amountOfHexInTile);

    mesh.castShadow     = true;
    mesh.receiveShadow  = true;
  
    return mesh;

  }

  const hexManipulator      = new THREE.Object3D();
  const grassManipulator    = new THREE.Object3D();
  const treeOneManipulator  = new THREE.Object3D();
  const treeTwoManipulator  = new THREE.Object3D();

  const geo         = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
  const hex         = setHexMesh(geo);
  hex.name          = tileName;
  geo.computeBoundsTree();

  const grassOne    = grassMeshes.grassMeshOne.clone();
  grassOne.name     = tileName;
  const grassTwo    = grassMeshes.grassMeshTwo.clone();
  grassTwo.name     = tileName;

  const treeOne    = treeMeshes.treeMeshOne.clone();
  grassOne.name     = tileName;
  const treeTwo    = treeMeshes.treeMeshTwo.clone();
  grassTwo.name     = tileName;

  terrainTiles.push({
    name:   tileName,
    hex:    hex,
    grass:  [
      grassOne.clone(),
      grassTwo.clone(),
    ],
    trees:  [
      treeOne.clone(),
      treeTwo.clone(),
    ]
  });
  
  let hexCounter      = 0;
  let grassOneCounter = 0;
  let grassTwoCounter = 0;
  let treeOneCounter  = 0;
  let treeTwoCounter  = 0;
  
  for(let i = centerTile.xFrom; i <= centerTile.xTo; i++) {
    for(let j = centerTile.yFrom; j <= centerTile.yTo; j++) {

      let noise     = (simplex.noise2D(i * 0.02, j * 0.02) + 1) * 0.5;
      noise         = Math.pow(noise, 1.9);
      const height  = noise * maxHeight;

      hexManipulator.scale.y = height >= sandHeight ? height : sandHeight;

      const pos = tileToPosition(i, height >= sandHeight ? height : sandHeight, j);
      hexManipulator.position.set(pos.x, pos.y, pos.z);

      hexManipulator.updateMatrix();
      hex.setMatrixAt(hexCounter, hexManipulator.matrix);

      if(height > snowHeight)               hex.setColorAt(hexCounter, textures.snow);
      else if(height > lightSnowHeight)     hex.setColorAt(hexCounter, textures.lightSnow);
      else if(height > rockHeight)          hex.setColorAt(hexCounter, textures.rock);
      else if(height > forestHeight) {

        hex.setColorAt(hexCounter, textures.forest);
        treeTwoManipulator.position.set(pos.x, (pos.y * 2) + Math.abs(treeTwo.geometry.boundingBox.min.y), pos.z);
        treeTwoManipulator.updateMatrix();

        if((Math.floor(Math.random() * 4)) === 0) {
          treeTwo.setMatrixAt(treeTwoCounter, treeTwoManipulator.matrix);
          treeTwoCounter++;
        }

      }
      else if(height > lightForestHeight) {

        hex.setColorAt(hexCounter, textures.lightForest);

        // treeOneManipulator.scale.set(0.35, .35, 0.35);
        // treeOneManipulator.rotation.x = -(Math.PI / 2);
        treeOneManipulator.position.set(pos.x, (pos.y * 2) + Math.abs(treeTwo.geometry.boundingBox.min.y), pos.z);
        treeOneManipulator.updateMatrix();

        if((Math.floor(Math.random() * 6)) === 0) {
          treeOne.setMatrixAt(treeOneCounter, treeOneManipulator.matrix);
          treeOneCounter++;
        }

      }
      else if(height > grassHeight) {

        hex.setColorAt(hexCounter, textures.grass);

        grassManipulator.scale.set(0.15, 0.15, 0.15);
        grassManipulator.rotation.x = -(Math.PI / 2);
        grassManipulator.position.set(pos.x, pos.y * 2, pos.z);
        grassManipulator.updateMatrix();

        if((Math.floor(Math.random() * 3)) === 0)
          switch (Math.floor(Math.random() * 2) + 1) {
            case 1:
              grassOne.setMatrixAt(grassOneCounter, grassManipulator.matrix);
              grassOneCounter++;
              break;
            case 2:
              grassTwo.setMatrixAt(grassTwoCounter, grassManipulator.matrix);
              grassTwoCounter++;
              break;
          }

      }
      else if(height > sandHeight)          hex.setColorAt(hexCounter, textures.sand);
      else if(height > shallowWaterHeight)  hex.setColorAt(hexCounter, textures.shallowWater);
      else if(height > waterHeight)         hex.setColorAt(hexCounter, textures.water);
      else if(height > deepWaterHeight)     hex.setColorAt(hexCounter, textures.deepWater);

      hexCounter++;

    }
  }

  scene.add(hex, grassOne, grassTwo, treeOne, treeTwo);

}

const cleanUp = () => {

  for(let i = terrainTiles.length - 1; i >= 0; i--) {

    let tileCoords  = JSON.parse(terrainTiles[i].hex.name);
    tileCoords      = {
      xFrom:  tileCoords.x,
      xTo:    tileCoords.x + tileWidth,
      yFrom:  tileCoords.y,
      yTo:    tileCoords.y + tileWidth
    }

    if(
      tileCoords.xFrom < centerTile.xFrom - tileWidth ||
      tileCoords.xTo > centerTile.xTo + tileWidth ||
      tileCoords.yFrom < centerTile.yFrom - tileWidth ||
      tileCoords.yTo > centerTile.yTo + tileWidth
    ) {
      const tile = scene.getObjectByProperty('name', terrainTiles[i].hex.name);
      tile.geometry.dispose();
      tile.material.dispose();
      scene.remove(tile);
      renderer.renderLists.dispose();
      terrainTiles.splice(i, 1);
    }

  }

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
 
  // if (event.keyCode == '38') tileYNegative(); // up arrow
  // else if (event.keyCode == '40') tileYPositive(); // down arrow
  // else if (event.keyCode == '37') tileXNegative(); // left arrow
  // else if (event.keyCode == '39') tileXPositive(); // right arrow

  if (event.keyCode == '87') { // w
    capsule.position.z -= 2;
    calcCapsulePos();
  }
  else if (event.keyCode == '83') { // s
    capsule.position.z += 2;
    calcCapsulePos(false);
  }
  else if (event.keyCode == '65') { // a
    capsule.position.x -= 2;
    calcCapsulePos();
  }
  else if (event.keyCode == '68') { // d
    capsule.position.x += 2;
    calcCapsulePos();
  }
  
}

const thirdPersonCamUpdate = () => {

  const calcIdealOffset = () => {
    const idealOffset = new THREE.Vector3(3, 14, 30);
    idealOffset.add(capsule.position)
    return idealOffset;
  }
  
  const calcIdealLookat = () => {
    const idealLookat = new THREE.Vector3(0, -5, -25);
    idealLookat.add(capsule.position)
    return idealLookat;
  }

  const idealOffset = calcIdealOffset();
  const idealLookat = calcIdealLookat();

  // const factor = 0.15;
  // currentPos.lerp(idealOffset, factor);
  // currentLookAt.lerp(idealLookat, factor);
  currentPos.copy(idealOffset);
  currentLookAt.copy(idealLookat);

  camera.position.copy(currentPos);
  camera.lookAt(currentLookAt);

}

const calcCapsulePos = (movingForward = true) => {

  // https://stackoverflow.com/questions/17443056/threejs-keep-object-on-surface-of-another-object
  raycaster.set(capsule.position, new THREE.Vector3(0, -1, movingForward ? -0.3 : 0.3));

  var intersects = raycaster.intersectObjects(terrainTiles.map(el => el.hex));

  if(activeTile !== intersects[0].object.name) createSurroundingTiles(intersects[0].object.name);

  if (distance > intersects[0].distance) capsule.position.y += (distance - intersects[0].distance) - 1;
  else capsule.position.y -= intersects[0].distance - distance;

  thirdPersonCamUpdate();
  
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
  // controls.update();
  // thirdPersonCamUpdate();
  renderer.render(scene, camera);
  statsPanel.end();

  requestAnimationFrame(render.bind(this))

}

setScene();


// const dummyNoise = () => {
//   https://www.redblobgames.com/maps/terrain-from-noise/
//   for (var y = 0; y < height; y++) {
//     for (var x = 0; x < width; x++) {      
//       var nx = x/width - 0.5, ny = y/height - 0.5;
//       var e = (0.83 * noiseE( 1 * nx,  1 * ny)
//              + 0.52 * noiseE( 2 * nx,  2 * ny)
//              + 0.30 * noiseE( 4 * nx,  4 * ny)
//              + 0.08 * noiseE( 8 * nx,  8 * ny)
//              + 0.04 * noiseE(16 * nx, 16 * ny)
//              + 0.02 * noiseE(32 * nx, 32 * ny));
//       e = e / (0.83 + 0.52 + 0.30 + 0.08 + 0.04 + 0.02);
//       e = Math.pow(e, 8.70);
//       var m = (0.71 * noiseM( 1 * nx,  1 * ny)
//              + 0.96 * noiseM( 2 * nx,  2 * ny)
//              + 0.68 * noiseM( 4 * nx,  4 * ny)
//              + 0.75 * noiseM( 8 * nx,  8 * ny)
//              + 0.84 * noiseM(16 * nx, 16 * ny)
//              + 0.97 * noiseM(32 * nx, 32 * ny));
//       m = m / (0.71 + 0.96 + 0.68 + 0.75 + 0.84 + 0.97);
//     }
//   }
// }