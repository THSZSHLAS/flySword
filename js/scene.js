import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export class SceneManager {
    constructor() {
        this.container = document.getElementById('canvas-container');

        // 1. Setup Basic Scene
        this.scene = new THREE.Scene();
        // Fog for depth
        this.scene.fog = new THREE.FogExp2(0x050505, 0.02);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 20;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        // 2. State & Objects
        this.swords = [];
        this.swordCount = 64; // Number of swords
        this.targetPoint = new THREE.Vector3(0, 0, 0); // Where the hand is
        this.mode = 'IDLE'; // Current formation mode
        this.time = 0;

        // 3. Init Components
        this.createSwordMesh();
        this.initPostProcessing();
        this.initStarField();

        window.addEventListener('resize', () => this.onResize());
    }

    createSwordMesh() {
        // Create a custom "Sword" geometry by merging parts
        const bladeGeo = new THREE.ConeGeometry(0.1, 3, 4);
        bladeGeo.rotateX(Math.PI / 2); // Point forward
        bladeGeo.translate(0, 0, 1.5); // Move center

        const hiltGeo = new THREE.BoxGeometry(0.6, 0.05, 0.2);
        hiltGeo.translate(0, 0, 0);

        // Use a Group is easier for individual movement logic usually,
        // but here we clone meshes for performance.
        const geometry = bladeGeo; // Simplification: Just the blade looks cooler as "energy"

        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            wireframe: false
        });

        for (let i = 0; i < this.swordCount; i++) {
            const sword = new THREE.Mesh(geometry, material.clone());

            // Initial Random Position
            sword.position.set(
                (Math.random() - 0.5) * 40,
                (Math.random() - 0.5) * 40,
                (Math.random() - 0.5) * 20 - 5
            );

            // Physics/Identity Properties
            sword.userData = {
                id: i,
                speed: 0.05 + Math.random() * 0.04, // Varied speed
                randomOffset: new THREE.Vector3(
                    (Math.random() - 0.5) * 3,
                    (Math.random() - 0.5) * 3,
                    (Math.random() - 0.5) * 3
                ),
                phase: Math.random() * Math.PI * 2
            };

            this.swords.push(sword);
            this.scene.add(sword);
        }
    }

    initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        // Heavy Bloom for "Energy" look
        const bloom = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5, 0.4, 0.85
        );
        bloom.threshold = 0;
        bloom.strength = 1.2; // Glowing intensity
        bloom.radius = 0.5;
        this.composer.addPass(bloom);
    }

    initStarField() {
        const geo = new THREE.BufferGeometry();
        const vertices = [];
        for(let i=0; i<1000; i++) {
            vertices.push((Math.random()-0.5)*100, (Math.random()-0.5)*100, (Math.random()-0.5)*50);
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const mat = new THREE.PointsMaterial({color: 0x555555, size: 0.1});
        this.stars = new THREE.Points(geo, mat);
        this.scene.add(this.stars);
    }

    // --- Core Logic: Receive Hand Data ---
    updateTarget(ndcX, ndcY) {
        // Convert normalized screen coords (-1 to 1) to 3D world coords
        // Project onto a plane at z=0
        const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
        vector.unproject(this.camera);
        const dir = vector.sub(this.camera.position).normalize();
        const distance = -this.camera.position.z / dir.z;
        const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));

        // Smoothly move target point
        this.targetPoint.lerp(pos, 0.1);
    }

    setMode(mode) {
        this.mode = mode;
    }

    // --- Main Animation Loop ---
    update() {
        this.time += 0.01;

        // Color Palette
        const colors = {
            'IDLE': new THREE.Color(0x00ffff), // Cyan
            'STREAM': new THREE.Color(0x00ffff), // Cyan
            'SPHERE': new THREE.Color(0xff0000), // Red
            'SHIELD': new THREE.Color(0xffd700)  // Gold
        };
        const targetColor = colors[this.mode] || colors['IDLE'];

        // Update each sword
        this.swords.forEach(sword => {
            const u = sword.userData;
            let targetPos = new THREE.Vector3();

            // --- FORMATION LOGIC ---

            if (this.mode === 'STREAM') {
                // Form: Follow the finger like a school of fish
                targetPos.copy(this.targetPoint).add(u.randomOffset);
                // Add snake-like waviness
                targetPos.x += Math.sin(this.time * 5 + u.id * 0.1) * 1.0;
                targetPos.y += Math.cos(this.time * 3 + u.id * 0.1) * 1.0;

            } else if (this.mode === 'SPHERE') {
                // Form: Condensed Ball of Energy
                // Distribute points on sphere
                const phi = Math.acos(-1 + (2 * u.id) / this.swordCount);
                const theta = Math.sqrt(this.swordCount * Math.PI) * phi;
                const r = 2.5; // Compact radius

                targetPos.setFromSphericalCoords(r, phi, theta + this.time * 2); // Rotate the sphere
                targetPos.add(this.targetPoint);

            } else if (this.mode === 'SHIELD') {
                // Form: Rotating Ring / Shield in front of hand
                const angle = (u.id / this.swordCount) * Math.PI * 2 + this.time * 2;
                const r = 6;
                targetPos.set(Math.cos(angle) * r, Math.sin(angle) * r, 0);
                targetPos.add(this.targetPoint);

            } else {
                // Mode: IDLE (Orbiting center)
                const angle = u.id * 0.1 + this.time * 0.2;
                const r = 10 + Math.sin(this.time + u.id)*2;
                targetPos.set(Math.cos(angle)*r, Math.sin(angle)*r * 0.5, Math.sin(angle + this.time)*5);
            }

            // --- PHYSICS MOVEMENT ---

            // 1. Move towards target (Lerp)
            sword.position.lerp(targetPos, u.speed);

            // 2. Rotate to face movement direction (LookAt)
            // We calculate where it will be slightly in future to orient it
            const lookTarget = targetPos.clone();
            // If in sphere mode, swords point OUTWARD from center (explosive look)
            if (this.mode === 'SPHERE') {
                lookTarget.sub(this.targetPoint).normalize().multiplyScalar(10).add(sword.position);
            }
            sword.lookAt(lookTarget);

            // 3. Color transition
            sword.material.color.lerp(targetColor, 0.05);
        });

        // Background rotation
        this.stars.rotation.z -= 0.0005;

        this.composer.render();
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }
}