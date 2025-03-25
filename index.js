import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SphereGeometry } from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.7.3/+esm';
import SimplexNoise from 'https://cdn.skypack.dev/simplex-noise@3.0.0';
import { Howl } from 'https://cdn.jsdelivr.net/npm/howler@2.2.3/+esm';
import { getGPUTier } from 'https://cdn.jsdelivr.net/npm/detect-gpu@5.0.17/+esm';
// Import lodash for vector utilities if needed
import _ from 'https://cdn.skypack.dev/lodash';

const container = document.querySelector('.container');
const canvas    = document.querySelector('.canvas');

let
gpuTier,
sizes,
scene,
camera,
camY,
camZ,
renderer,
clock,
raycaster,
distance,
flyingIn,
clouds,
movingCharDueToDistance,
movingCharTimeout,
currentPos,
currentLookAt,
lookAtPosZ,
thirdPerson,
doubleSpeed,
character,
manaOrbs,
orbCount,
collectSound,
charPosYIncrement,
charRotateYIncrement,
charRotateYMax,
mixer,
charAnimation,
gliding,
charAnimationTimeout,
charNeck,
charBody,
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
activeKeysPressed,
bgMusic,
muteBgMusic,
infoModalDisplayed,
loadingDismissed,
orbsSpawned,
// Flight control variables
currentSpeed,
maxSpeed,
minSpeed,
pointerLocked; // Track if pointer is locked

const setupCursorIndicator = () => {
  cursorIndicator = document.querySelector('.cursor-indicator');
  if (!cursorIndicator) {
    console.error('Cursor indicator element not found');
  }
};

const setScene = async () => {

  gpuTier = await getGPUTier();
  console.log(gpuTier.tier);

  sizes = {
    width:  container.offsetWidth,
    height: container.offsetHeight
  };

  scene             = new THREE.Scene();
  scene.background  = new THREE.Color(0x6699FF); // Brighter blue sky like in screenshot

  flyingIn  = false; // Skip the intro - start immediately
  camY      = 7, // Start with camera already in position
  camZ      = -10;
  camera    = new THREE.PerspectiveCamera(90, sizes.width / sizes.height, 1, 800); // Higher FOV (90) and far draw distance
  camera.position.set(0, camY, camZ);
  
  renderer = new THREE.WebGLRenderer({
    canvas:     canvas,
    antialias:  false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputEncoding = THREE.sRGBEncoding;
  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5));

  gltfLoader = new GLTFLoader();
  
  activeKeysPressed   = [];
  muteBgMusic         = true;
  infoModalDisplayed  = false;
  
  // Flight control initializations
  currentSpeed = 0;
  maxSpeed = 1.0;
  minSpeed = -0.3; // Allow some reverse movement
  pointerLocked = false;

  joystick();
  setFog();
  setRaycast();
  setTerrainValues();
  orbCount = 0;
  manaOrbs = [];
  orbsSpawned = false;
  collectSound = new Howl({
    src: ['https://cdn.freesound.org/previews/242/242501_4284968-lq.mp3'],
    volume: 0.5
  });
  await setClouds();
  await setCharacter();
  await createManaOrbs();
  await setGrass();
  await setTrees();
  setCam();
  createTile();
  createSurroundingTiles(`{"x":${centerTile.xFrom},"y":${centerTile.yFrom}}`);
  calcCharPos();
  resize();
  listenTo();
  
  // Skip loading screen
  loadingDismissed = true;
  document.querySelector('.page-loader').style.display = 'none';
  
  render();
  playMusic();
}

const joystick = () => {

  const calcJoystickDir = (deg) => {

    activeKeysPressed = [];

    if(deg < 22.5 || deg >= 337.5) activeKeysPressed.push(39); // right
    if(deg >= 22.5 && deg < 67.5) {
      activeKeysPressed.push(38);
      activeKeysPressed.push(39);
    } // up right
    if(deg >= 67.5 && deg < 112.5) activeKeysPressed.push(38); // up
    if(deg >= 112.5 && deg < 157.5) {
      activeKeysPressed.push(38);
      activeKeysPressed.push(37);
    } // up left
    if(deg >= 157.5 && deg < 202.5) activeKeysPressed.push(37); // left
    if(deg >= 202.5 && deg < 247.5) {
      activeKeysPressed.push(40);
      activeKeysPressed.push(37);
    } // down left
    if(deg >= 247.5 && deg < 292.5) activeKeysPressed.push(40); // down
    if(deg >= 292.5 && deg < 337.5) {
      activeKeysPressed.push(40);
      activeKeysPressed.push(39);
    } // down right

  }

  const joystickOptions = {
    zone: document.getElementById('zone-joystick'),
    shape: 'circle',
    color: '#ffffff6b',
    mode: 'dynamic'
  };

  const manager = nipplejs.create(joystickOptions);

  manager.on('move', (e, data) => calcJoystickDir(data.angle.degree));
  manager.on('end', () => (activeKeysPressed = []));

};

const setFog = () => {

  THREE.ShaderChunk.fog_pars_vertex += `
    #ifdef USE_FOG
      varying vec3 vWorldPosition;
    #endif
  `;

  THREE.ShaderChunk.fog_vertex += `
    #ifdef USE_FOG
      vec4 worldPosition = projectionMatrix * modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
    #endif
  `;

  THREE.ShaderChunk.fog_pars_fragment += `
    #ifdef USE_FOG
      varying vec3 vWorldPosition;
      float fogHeight = 10.0;
    #endif
  `;

  const FOG_APPLIED_LINE = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );';
  THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(FOG_APPLIED_LINE, `
    float heightStep = smoothstep(fogHeight, 0.0, vWorldPosition.y);
    float fogFactorHeight = smoothstep( fogNear * 0.7, fogFar, vFogDepth );
    float fogFactorMergeHeight = fogFactorHeight * heightStep;
    
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactorMergeHeight );
    ${FOG_APPLIED_LINE}
  `);

  // Increase fog distances significantly to match the open view in the screenshot
  const near = 150; // Much further fog start
  const far = 600;  // Much further fog end

  scene.fog = new THREE.Fog(0x6699FF, near, far); // Match sky color
}

const setRaycast = () => {

  THREE.BufferGeometry.prototype.computeBoundsTree  = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree  = disposeBoundsTree;
  THREE.Mesh.prototype.raycast                      = acceleratedRaycast;

  raycaster = new THREE.Raycaster();
  distance  = 14;
  movingCharDueToDistance = false;
  raycaster.firstHitOnly = true;

}

const setTerrainValues = () => {

  const centerTileFromTo = 60; // MUCH larger terrain

  centerTile = {
    xFrom:  -centerTileFromTo,
    xTo:    centerTileFromTo,
    yFrom:  -centerTileFromTo,
    yTo:    centerTileFromTo
  };
  tileWidth             = centerTileFromTo * 2; 
  amountOfHexInTile     = Math.pow((centerTile.xTo + 1) - centerTile.xFrom, 2); 
  simplex               = new SimplexNoise();
  
  // Much higher max height for dramatic terrain
  maxHeight             = 70; 
  snowHeight            = maxHeight * 0.85;
  lightSnowHeight       = maxHeight * 0.75;
  rockHeight            = maxHeight * 0.65;
  forestHeight          = maxHeight * 0.5;
  lightForestHeight     = maxHeight * 0.4;
  grassHeight           = maxHeight * 0.25;
  sandHeight            = maxHeight * 0.15; 
  shallowWaterHeight    = maxHeight * 0.1;
  waterHeight           = maxHeight * 0.05;
  deepWaterHeight       = maxHeight * 0;
  
  // More variety in colors
  textures              = {
    snow:         new THREE.Color(0xFFFFFF), // White snow
    lightSnow:    new THREE.Color(0xE8E8E8), // Light snow
    rock:         new THREE.Color(0x777777), // Dark gray rock
    forest:       new THREE.Color(0x225522), // Dark green
    lightForest:  new THREE.Color(0x447744), // Medium green
    grass:        new THREE.Color(0x88BB33), // Yellowish green
    sand:         new THREE.Color(0xEEDD88), // Bright sand
    shallowWater: new THREE.Color(0x77AAFF), // Light blue
    water:        new THREE.Color(0x0066DD), // Medium blue
    deepWater:    new THREE.Color(0x003388) // Dark blue
  };
  terrainTiles      = [];
  
}

const setClouds = async () => {

  clouds                = []
  const amountOfClouds  = 10;

  const createClouds = async () => {
    
    const cloudModels     = [];
    const cloudModelPaths = [
      'assets/clouds/cloud-one/scene.gltf',
      'assets/clouds/cloud-two/scene.gltf'
    ];
  
    for(let i = 0; i < cloudModelPaths.length; i++)
      cloudModels[i] = await gltfLoader.loadAsync(cloudModelPaths[i]);

    return cloudModels;

  }

  const getRandom = (max, min) => {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  const cloudModels = await createClouds();

  for(let i = 0; i < Math.floor(amountOfClouds / 2) * 2; i++) {

    let cloud;

    if(i < Math.floor(amountOfClouds / 2)) { // cloud-one
      cloud = cloudModels[0].scene.clone();
      cloud.scale.set(5.5, 5.5, 5.5);
      cloud.rotation.y = cloud.rotation.z = -(Math.PI / 2);
    }
    else { // cloud-two
      cloud = cloudModels[1].scene.clone();
      cloud.scale.set(0.02, 0.02, 0.02);
      cloud.rotation.y = cloud.rotation.z = 0;
    }

    cloud.name = `cloud-${i}`
    cloud.position.set(
      getRandom(-20, 20),
      getRandom(camY - 90, camY - 110), 
      getRandom(camZ + 200, camZ + 320)
    );

    scene.add(cloud);
    clouds.push(cloud);

  }

  return;

}

const animateClouds = () => {

  for(let i = 0; i < clouds.length; i++)
    clouds[i].position.x = 
    clouds[i].position.x < 0 
      ? clouds[i].position.x - (clock.getElapsedTime() * 0.04) 
      : clouds[i].position.x + (clock.getElapsedTime() * 0.04);

}

const cleanUpClouds = () => {

  flyingIn = false;
  playMusic();

  for(let i = 0; i < clouds.length; i++) {
    const cloud = scene.getObjectByProperty('name', `cloud-${i}`);
    cleanUp(cloud);
  }

  clouds = undefined;

}

const setCharAnimation = () => {
  // For our simple carpet model, we'll just clear any existing animation timeout
  if(charAnimationTimeout) clearTimeout(charAnimationTimeout);
  
  // Since we don't have actual animations, we'll set the gliding flag
  // to help with the floating animation in determineMovement
  gliding = true;
}

const createManaOrbs = async () => {
  try {
    // Load orb model (but we'll use mesh directly for simplicity)
    await gltfLoader.loadAsync('assets/orbs/scene.gltf');
    
    // Will be populated later during gameplay
    manaOrbs = [];
  } catch(error) {
    console.error('Error loading orb model:', error);
  }
  return;
}

const setCharacter = async () => {
  try {
    // Create a simple carpet shape directly instead of loading a model
    const carpetGeometry = new THREE.BoxGeometry(2, 0.2, 3);
    const carpetMaterial = new THREE.MeshStandardMaterial({
      color: 0x0000FF, // Blue like in the screenshot
      emissive: 0x0000AA,
      emissiveIntensity: 0.2,
      roughness: 0.3
    });

    character = new THREE.Mesh(carpetGeometry, carpetMaterial);
    character.name = 'MagicCarpet';

    character.position.set(0, 25, 0);
    character.scale.set(3, 1, 3);

    charPosYIncrement     = 0;
    charRotateYIncrement  = 0;
    charRotateYMax        = 0.015; // Slightly more responsive turning

    // We don't have animations for the simple carpet
    mixer = null;
    charAnimation = null;

    // Store references for movement
    charNeck = character;
    charBody = character;

    carpetGeometry.computeBoundsTree();
    scene.add(character);
  } catch(error) {
    console.error('Error creating carpet:', error);
  }

  return;
}
  
  const setGrass = async () => {
  
    grassMeshes           = {};
    const model           = await gltfLoader.loadAsync('assets/grass/scene.gltf');
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
      grassMeshes[grassMeshNames[i].varName] = new THREE.InstancedMesh(geo, mat, Math.floor(amountOfHexInTile / 40));
    }
  
    return;
  }
  
  const setTrees = async () => {
  
    treeMeshes          = {};
    const treeMeshNames = [
      {
        varName:    'treeMeshOne',
        modelPath:  'assets/trees/pine/scene.gltf',
        meshName:   'Object_4'
      },
      {
        varName:    'treeMeshTwo',
        modelPath:  'assets/trees/twisted-branches/scene.gltf',
        meshName:   'Tree_winding_01_Material_0'
      }
    ];
  
    for(let i = 0; i < treeMeshNames.length; i++) {
      const model  = await gltfLoader.loadAsync(treeMeshNames[i].modelPath);
      const mesh  = model.scene.getObjectByName(treeMeshNames[i].meshName);
      const geo   = mesh.geometry.clone();
      const mat   = mesh.material.clone();
      treeMeshes[treeMeshNames[i].varName] = new THREE.InstancedMesh(geo, mat, Math.floor(amountOfHexInTile / 45));
    }
  
    return;
  }
  
  // Initialize camera and character positions
const setCam = () => {
  currentPos    = new THREE.Vector3();
  currentLookAt = new THREE.Vector3();
  lookAtPosZ    = 15;
  thirdPerson   = true;
  doubleSpeed   = false;
  
  // Set initial camera position to be behind the character
  // and rotate to look at the character
  const offset = new THREE.Vector3(0, 5, 10); // Above and behind
  camera.position.copy(character.position).add(offset);
  camera.lookAt(character.position);
}



// Movement state variables
let mousePos = new THREE.Vector2(0, 0);
let moveForward = false;
let moveBackward = false;
let bankLeft = false;
let bankRight = false;
let moveUp = false;
let moveDown = false;


// Debug overlay
const debugDiv = document.createElement('div');
debugDiv.style.position = 'fixed';
debugDiv.style.top = '10px';
debugDiv.style.left = '10px';
debugDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
debugDiv.style.color = 'white';
debugDiv.style.padding = '10px';
debugDiv.style.fontFamily = 'monospace';
debugDiv.style.zIndex = '1000';
document.body.appendChild(debugDiv);

const logDebug = (data) => {
    debugDiv.innerHTML = `
        Mouse Pos: ${data.mousePos ? data.mousePos.map(v => v.toFixed(2)).join(', ') : '0, 0'}<br>
        Mouse Dir: ${data.mouseDir.map(v => v.toFixed(2)).join(', ')}<br>
        Speed: ${data.speed.toFixed(2)}<br>
        Pos: ${data.pos.map(v => v.toFixed(2)).join(', ')}<br>
        Rot: ${data.rot.map(v => v.toFixed(2)).join(', ')}<br>
    `;
};

const onMouseMove = (event) => {
  // Simply track mouse position
  mousePos.x = event.clientX;
  mousePos.y = event.clientY;
}


// Movement update function - TRUE Assassin's Creed eagle style
const determineMovement = () => {
  if (!character) return;

  // Get window dimensions for mouse position normalization
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  // Calculate normalized mouse position (-1 to 1)
  const mousePosNormalized = {
    x: (mousePos.x / windowWidth) * 2 - 1,
    y: (mousePos.y / windowHeight) * 2 - 1
  };
  
  // Determine speed based on whether boost is active
  const speed = moveForward ? (doubleSpeed ? 1.0 : 0.5) : 0;
  
  // Only move if W is pressed - no automatic movement
  if (moveForward) {
    // Movement direction based on carpet's orientation
    const direction = new THREE.Vector3(0, 0, -1); // Forward is negative Z in three.js
    direction.applyQuaternion(character.quaternion);
    
    // Apply movement
    character.position.x += direction.x * speed;
    character.position.z += direction.z * speed;
  }
  
  // Backward movement (slower)
  if (moveBackward) {
    const direction = new THREE.Vector3(0, 0, 1);
    direction.applyQuaternion(character.quaternion);
    
    // Apply slower backward movement
    character.position.x += direction.x * speed * 0.5;
    character.position.z += direction.z * speed * 0.5;
  }
  
  // Direct up/down (Y-axis) movement
  if (moveUp) {
    character.position.y += speed * 0.5;
  }
  if (moveDown) {
    character.position.y -= speed * 0.5;
  }
  
  // Use mouse for rotation control
  // Horizontal mouse position affects rotation (yaw)
  character.rotation.y = THREE.MathUtils.lerp(
    character.rotation.y,
    -mousePosNormalized.x * Math.PI, // Full 180° turn based on mouse position
    0.05 // Smooth turning
  );
  
  // Fix carpet orientation to be more natural (like in the screenshot)
  // Vertical mouse position affects pitch (limit to prevent unnatural upward tilt)
  const maxPitchUp = 0.2; // Limit upward tilt
  const maxPitchDown = 0.5; // Allow more downward tilt
  
  // Calculate desired pitch based on mouse position but with limits
  let pitchAngle = mousePosNormalized.y * 0.5;
  pitchAngle = Math.max(-maxPitchDown, Math.min(maxPitchUp, pitchAngle));
  
  character.rotation.x = THREE.MathUtils.lerp(
    character.rotation.x,
    pitchAngle,
    0.05 // Smooth pitching
  );
  
  // Calculate banking angle based on turning (roll)
  const bankAngle = -mousePosNormalized.x * 0.5; // Bank while turning
  character.rotation.z = THREE.MathUtils.lerp(
    character.rotation.z,
    bankAngle,
    0.1 // Smooth banking
  );
  
  // Gentle hover effect
  const hoverAmount = Math.sin(clock.getElapsedTime() * 2) * 0.1;
  character.position.y += hoverAmount;
};

const camUpdate = () => {
  if (!character) return;

  // Position camera much higher and further back for an expansive view like the screenshot
  // Create a vector far behind and high above the character in local space
  const offset = new THREE.Vector3(0, 30, 80); // Much higher and further back
  offset.applyQuaternion(character.quaternion);
  
  // Position camera relative to the character with the rotated offset
  const targetPos = character.position.clone().add(offset);
  camera.position.lerp(targetPos, 0.1); // Smooth camera movement
  
  // Look at a point ahead of the character for a more distant view
  // This creates the open perspective from the screenshot
  const lookAheadPoint = character.position.clone();
  lookAheadPoint.y -= 10; // Look downward a bit more
  camera.lookAt(lookAheadPoint);
};
// Event listeners setup
const setupControls = () => {    
    // Input handlers
    document.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
};

// Keyboard input handlers
const keyDown = (event) => {
    if(infoModalDisplayed) return;

    const keyCode = typeof event.keyCode === 'number' ? event.keyCode : event.which;
    
    // Prevent default actions for game control keys
    if([32, 87, 83, 65, 68, 16].includes(keyCode)) {
        event.preventDefault();
    }

    if(!activeKeysPressed.includes(keyCode)) {
        activeKeysPressed.push(keyCode);
    }
    
    // Set movement flags based on keys
    if(keyCode === 87) moveForward = true;  // W
    if(keyCode === 83) moveBackward = true; // S
    if(keyCode === 65) bankLeft = true;     // A
    if(keyCode === 68) bankRight = true;    // D
    if(keyCode === 81) moveUp = true;       // Q
    if(keyCode === 69) moveDown = true;     // E
};

const keyUp = (event) => {
    if(event.keyCode === 32) toggleDoubleSpeed();
    if(event.keyCode === 90) toggleBirdsEyeView();

    const index = activeKeysPressed.indexOf(event.keyCode);
    if (index !== -1) {
        activeKeysPressed.splice(index, 1);
    }
    
    // Clear movement flags based on keys
    if(event.keyCode === 87) moveForward = false;  // W
    if(event.keyCode === 83) moveBackward = false; // S
    if(event.keyCode === 65) bankLeft = false;     // A
    if(event.keyCode === 68) bankRight = false;    // D
    if(event.keyCode === 81) moveUp = false;       // Q
    if(event.keyCode === 69) moveDown = false;     // E
};


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
  
    cleanUpTiles();
  
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
    return new THREE.Vector3((tileX + (tileY % 2) * 0.5) * 3.0, height / 2, tileY * 3.0); // Wider spacing
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

  // Use larger hex geometry for less detail but more impressive scale
  const geo = new THREE.CylinderGeometry(3, 3, 1, 6, 1, false);
  const hex = setHexMesh(geo);
  hex.name  = tileName;
  geo.computeBoundsTree();

  const grassOne  = grassMeshes.grassMeshOne.clone();
  grassOne.name   = tileName;
  const grassTwo  = grassMeshes.grassMeshTwo.clone();
  grassTwo.name   = tileName;

  const treeOne = treeMeshes.treeMeshOne.clone();
  treeOne.name  = tileName;
  const treeTwo = treeMeshes.treeMeshTwo.clone();
  treeTwo.name  = tileName;

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
  
  for(let i = centerTile.xFrom; i <= centerTile.xTo; i += 2) { // Increase step size for less detail
    for(let j = centerTile.yFrom; j <= centerTile.yTo; j += 2) { // Increase step size for less detail

      // Use more dramatic noise values for greater height variations
      let noise1     = (simplex.noise2D(i * 0.01, j * 0.01) + 1.5) * 0.35; // More dramatic mountain ranges
      noise1         = Math.pow(noise1, 1.5); // More exponential growth
      let noise2     = (simplex.noise2D(i * 0.015, j * 0.015) + 1) * 0.85;
      noise2         = Math.pow(noise2, 1.3);
      const height   = noise1 * noise2 * maxHeight;

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
        treeTwoManipulator.scale.set(2.5, 3.0, 2.5); // Larger trees but fewer
        treeTwoManipulator.rotation.y = Math.floor(Math.random() * 3);
        treeTwoManipulator.position.set(pos.x, (pos.y * 2) + 10, pos.z);
        treeTwoManipulator.updateMatrix();

        if((Math.floor(Math.random() * 50)) === 0) { // Much less frequent trees
          treeTwo.setMatrixAt(treeTwoCounter, treeTwoManipulator.matrix);
          treeTwoCounter++;
        }

      }
      else if(height > lightForestHeight) {

        hex.setColorAt(hexCounter, textures.lightForest);

        treeOneManipulator.scale.set(1.0, 1.0, 1.0); // Larger trees
        treeOneManipulator.position.set(pos.x, (pos.y * 2) + 2, pos.z);
        treeOneManipulator.updateMatrix();

        if((Math.floor(Math.random() * 40)) === 0) { // Much less frequent trees
          treeOne.setMatrixAt(treeOneCounter, treeOneManipulator.matrix);
          treeOneCounter++;
        }

      }
      else if(height > grassHeight) {

        hex.setColorAt(hexCounter, textures.grass);

        grassManipulator.scale.set(0.5, 0.5, 0.5); // Larger grass
        grassManipulator.rotation.x = -(Math.PI / 2);
        grassManipulator.position.set(pos.x, pos.y * 2, pos.z);
        grassManipulator.updateMatrix();

        if((Math.floor(Math.random() * 60)) === 0) // Much less frequent grass
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
  
  const cleanUpTiles = () => {
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
        const tile = scene.getObjectsByProperty('name', terrainTiles[i].hex.name);
        for(let o = 0; o < tile.length; o++) cleanUp(tile[o]);
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

const toggleDoubleSpeed = () => {
  if(flyingIn) return;
  doubleSpeed = doubleSpeed ? false : true;
  // Visual feedback for speed change
  const speedIcon = document.querySelector('.hex-speed img');
  if (speedIcon) {
    speedIcon.style.filter = doubleSpeed ? 'brightness(1.5) hue-rotate(45deg)' : '';
  }
  setCharAnimation();
}

const toggleBirdsEyeView = () => {
  if(flyingIn) return;
  thirdPerson = thirdPerson ? false : true;
}

// Make sure the pointerlockchange event updates the pointerLocked variable
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === document.body;
  console.log('Pointer lock changed:', pointerLocked);
});



// Collision detection
const calcCharPos = () => {
  if (!character) return;
  
  // Set up raycaster to detect ground below
  raycaster.set(character.position, new THREE.Vector3(0, -1, 0));
  
  // Check for terrain intersections
  const intersects = raycaster.intersectObjects(terrainTiles.map(el => el.hex));
  
  // Handle terrain tiles
  if (intersects.length > 0) {
    // Only update tiles if we've moved to a new section
    if (activeTile !== intersects[0].object.name) {
      createSurroundingTiles(intersects[0].object.name);
    }
    
    // Avoid collisions with terrain
    if (intersects[0].distance < distance) {
      character.position.y += 0.5;
    }
  }
  
  // Update camera to follow
  camUpdate();
};

// No longer need pointer lock for the new control scheme

const listenTo = () => {
  // Set up input events
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  
  // Listen for mouse movement
  document.addEventListener('mousemove', onMouseMove);
  
  // UI buttons
  document.querySelector('.hex-music')
    .addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent click from triggering pointer lock
      updateMusicVolume();
    });
  document.querySelector('.hex-info')
    .addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent click from triggering pointer lock
      toggleInfoModal();
    });
  document.querySelector('.info-close')
    .addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent click from triggering pointer lock
      toggleInfoModal(false);
    });
  document.querySelector('.hex-speed')
    .addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent click from triggering pointer lock
      toggleDoubleSpeed();
    });
  document.querySelector('.hex-birds-eye')
    .addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent click from triggering pointer lock
      toggleBirdsEyeView();
    });
};

const spawnManaOrbs = () => {
  if (orbsSpawned) return;
  
  const orbCount = 50; // Number of orbs to spawn
  
  // Create orbs in patterns and clusters for more interesting gameplay
  for (let i = 0; i < orbCount; i++) {
    // Create a simple sphere for our orb with better materials
    const orbGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const orbMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x7B42F6,
      emissive: 0x5428C0,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.8,
      metalness: 0.7,
      roughness: 0.2
    });
    
    const orb = new THREE.Mesh(orbGeometry, orbMaterial);
    
    // Add a glow effect (optional)
    const glowGeometry = new THREE.SphereGeometry(0.7, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x5428C0,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    orb.add(glow);
    
    // Position orbs in more interesting patterns
    let x, y, z;
    
    // Create some orbs in clusters, others in lines, and some random
    if (i % 3 === 0) {
      // Cluster pattern
      const cluster = Math.floor(i / 3) % 5;
      const angle = (i % 10) * Math.PI * 2 / 10;
      const radius = 10 + (i % 5) * 2;
      
      x = Math.cos(angle) * radius + (cluster * 25 - 50);
      z = Math.sin(angle) * radius + (cluster * 25 - 50);
      y = 20 + Math.random() * 10;
    } else if (i % 3 === 1) {
      // Line pattern
      const line = Math.floor(i / 10) % 3;
      x = (i % 10) * 10 - 50;
      z = line * 30 - 30;
      y = 30 + Math.sin(i * 0.5) * 5;
    } else {
      // Random pattern
      x = (Math.random() - 0.5) * 150;
      y = Math.random() * 40 + 20;
      z = (Math.random() - 0.5) * 150;
    }
    
    orb.position.set(x, y, z);
    orb.name = `manaOrb-${i}`;
    
    // Add to scene and track in array
    scene.add(orb);
    manaOrbs.push(orb);
  }
  
  orbsSpawned = true;
};

const checkOrbCollisions = () => {
  if (!character || manaOrbs.length === 0) return;
  
  const charPosition = character.position.clone();
  const collectionDistance = 3; // How close to collect an orb
  
  for (let i = manaOrbs.length - 1; i >= 0; i--) {
    const orb = manaOrbs[i];
    if (!orb) continue;
    
    const distance = charPosition.distanceTo(orb.position);
    
    // Add magnetic effect when getting close to orbs
    const magneticRange = 8;
    if (distance < magneticRange && distance > collectionDistance) {
      // Create a vector from orb to character
      const pull = charPosition.clone().sub(orb.position);
      pull.normalize().multiplyScalar(0.1 * (magneticRange - distance) / magneticRange);
      
      // Move orb toward character
      orb.position.add(pull);
    }
    
    // Check for collision
    if (distance < collectionDistance) {
      // Update score
      orbCount++;
      document.getElementById('orb-count').textContent = orbCount;
      
      // Remove orb with a small visual effect
      const orbPosition = orb.position.clone();
      scene.remove(orb);
      manaOrbs.splice(i, 1);
      
      // Play sound effect
      if (collectSound) collectSound.play();
    }
    
    // Animate orb
    if (orb) {
      orb.rotation.y += 0.01;
      orb.rotation.x += 0.005;
      
      // More natural floating motion
      const time = clock.getElapsedTime();
      orb.position.y += Math.sin(time * 1.5 + i * 0.5) * 0.015;
      
      // Subtle horizontal movement
      orb.position.x += Math.sin(time * 0.8 + i * 1.1) * 0.003;
      orb.position.z += Math.cos(time * 0.7 + i * 0.9) * 0.003;
    }
  }
};

const cleanUp = (obj) => {
  if(obj.geometry && obj.material) {
    obj.geometry.dispose();
    obj.material.dispose();
  }
  else {
    obj.traverse(el => {
      if(el.isMesh) {
        el.geometry.dispose();
        el.material.dispose();
      }
    });
  }

  scene.remove(obj);
  renderer.renderLists.dispose();
};

const render = () => {
  if(loadingDismissed) {
    determineMovement();
    calcCharPos();
    if(flyingIn) animateClouds();
    if(mixer) mixer.update(clock.getDelta());
  
    // Only spawn orbs after flying in
    if(!flyingIn && !orbsSpawned) {
      spawnManaOrbs();
    }
    
    // Check for orb collections
    if(!flyingIn && orbsSpawned) {
      checkOrbCollisions();
    }
  }
  
  renderer.render(scene, camera);
  requestAnimationFrame(render);
};

const playMusic = () => {
  try {
    bgMusic = new Howl({
      src: ['https://cdn.freesound.org/previews/451/451421_2454548-lq.mp3'],
      autoplay: true,
      loop: true,
      volume: 0,
    });

    bgMusic.play();
  } catch(error) {
    console.error('Error playing background music:', error);
  }
};

const updateMusicVolume = () => {
  muteBgMusic = !muteBgMusic;
  bgMusic.volume(muteBgMusic ? 0 : 0.01);

  document.getElementById('sound').src = 
    muteBgMusic ? 
    'assets/icons/sound-off.svg' :
    'assets/icons/sound-on.svg';
};

const pauseIconAnimation = (pause = true) => {
  if(pause) {
    document.querySelector('.hex-music').classList.add('js-loading');
    document.querySelector('.hex-info').classList.add('js-loading');
    document.querySelector('.hex-speed').classList.add('js-loading');
    document.querySelector('.hex-birds-eye').classList.add('js-loading');
    return;
  }

  document.querySelector('.hex-music').classList.remove('js-loading');
  document.querySelector('.hex-info').classList.remove('js-loading');
  document.querySelector('.hex-speed').classList.remove('js-loading');
  document.querySelector('.hex-birds-eye').classList.remove('js-loading');
};

const toggleInfoModal = (display = true) => {
  infoModalDisplayed = display;

  if(display) return gsap.timeline()
    .to('.info-modal-page', {
      zIndex: 100
    })
    .to('.info-modal-page', {
      opacity:  1,
      duration: 1
    })
    .to('.info-box', {
      opacity:  1,
      duration: 1
    });

  gsap.timeline()
    .to('.info-box', {
      opacity:  0,
      duration: 0.5
    })
    .to('.info-modal-page', {
      opacity:  0,
      duration: 0.5
    })
    .to('.info-modal-page', {
      zIndex: -1
    });
};

// Hide loading screen immediately
document.querySelector('.page-loader').style.display = 'none';

// Start everything
setScene();