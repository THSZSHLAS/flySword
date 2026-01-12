import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';

export class SceneManager {
    constructor() {
        this.container = document.getElementById('canvas-container');

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x020202, 0.03);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 25;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.swords = [];
        this.swordCount = 80;
        this.targetPoint = new THREE.Vector3(0, 0, 0);
        this.mode = 'IDLE';
        this.time = 0;

        // Reuse temp vectors (avoid per-frame allocations)
        this._tmpVec3A = new THREE.Vector3();
        this._tmpVec3B = new THREE.Vector3();
        this._tmpVec3C = new THREE.Vector3();

        // Pre-create colors (avoid new Color each frame)
        this.colors = {
            IDLE: new THREE.Color(0x00ffff),
            STREAM: new THREE.Color(0x00ffff),
            SPHERE: new THREE.Color(0xff3333),
            SHIELD: new THREE.Color(0xffaa00)
        };

        this.createSwordMesh();
        this.initPostProcessing();
        this.initStarField();

        window.addEventListener('resize', () => this.onResize());
    }

    createSwordMesh() {
        const geometry = new THREE.ConeGeometry(0.12, 4.5, 5);
        geometry.rotateX(Math.PI / 2);

        const material = new THREE.MeshBasicMaterial({ color: 0x00ffff });

        for (let i = 0; i < this.swordCount; i++) {
            const sword = new THREE.Mesh(geometry, material.clone());

            sword.position.set(
                (Math.random() - 0.5) * 60,
                (Math.random() - 0.5) * 60,
                (Math.random() - 0.5) * 40 - 10
            );

            sword.userData = {
                id: i,
                speed: 0.01 + Math.random() * 0.05,
                randomOffset: new THREE.Vector3(
                    (Math.random() - 0.5) * 15,
                    (Math.random() - 0.5) * 15,
                    (Math.random() - 0.5) * 10
                ),
                freq: Math.random() * 2 + 0.5,

                // Spring-damper state (for inertia trails)
                vel: new THREE.Vector3()
            };

            this.swords.push(sword);
            this.scene.add(sword);
        }
    }

    initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        // Afterimage trailing (global motion trails)
        this.afterimagePass = new AfterimagePass();
        // 0.85 = longer trail, 0.95 = shorter/cleaner
        this.afterimagePass.uniforms['damp'].value = 0.90;
        this.composer.addPass(this.afterimagePass);

        const bloom = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5, 0.4, 0.85
        );
        bloom.threshold = 0;
        bloom.strength = 1.0;
        bloom.radius = 0.8;
        this.composer.addPass(bloom);
    }

    initStarField() {
        const geo = new THREE.BufferGeometry();
        const vertices = [];
        for (let i = 0; i < 1500; i++) {
            vertices.push(
                (Math.random() - 0.5) * 150,
                (Math.random() - 0.5) * 150,
                (Math.random() - 0.5) * 100
            );
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const mat = new THREE.PointsMaterial({
            color: 0x666666,
            size: 0.15,
            transparent: true,
            opacity: 0.6
        });
        this.stars = new THREE.Points(geo, mat);
        this.scene.add(this.stars);
    }

    updateTarget(ndcX, ndcY) {
        const v = this._tmpVec3A.set(ndcX, ndcY, 0.5);
        v.unproject(this.camera);

        const dir = this._tmpVec3B.copy(v).sub(this.camera.position).normalize();
        const distance = -this.camera.position.z / dir.z;
        const pos = this._tmpVec3C.copy(this.camera.position).addScaledVector(dir, distance);

        // Dynamic smoothing: large moves follow faster, small jitter follows slower
        const d = pos.distanceTo(this.targetPoint);
        const t = THREE.MathUtils.clamp(d * 0.08, 0.06, 0.22);
        this.targetPoint.lerp(pos, t);
    }

    setMode(mode) {
        this.mode = mode;
    }

    update() {
        this.time += 0.01;

        const targetColor = this.colors[this.mode] || this.colors.IDLE;
        const colorLerpSpeed = 0.05;

        // Spring parameters per mode (tuned for “inertia trail”)
        const modeK = {
            IDLE: 0.012,
            STREAM: 0.020,
            SHIELD: 0.040,
            SPHERE: 0.110
        };
        const modeDamp = {
            IDLE: 0.90,
            STREAM: 0.86,
            SHIELD: 0.82,
            SPHERE: 0.74
        };

        // Reused vectors (no allocations inside loop)
        const targetPos = this._tmpVec3A;
        const toTarget = this._tmpVec3B;
        const outward = this._tmpVec3C;

        for (let i = 0; i < this.swords.length; i++) {
            const sword = this.swords[i];
            const u = sword.userData;

            // --- Formation target ---
            targetPos.set(0, 0, 0);

            if (this.mode === 'STREAM') {
                targetPos.copy(this.targetPoint).add(u.randomOffset);

                const breathing = Math.sin(this.time * 0.5) * 0.2 + 1;
                targetPos.sub(this.targetPoint).multiplyScalar(breathing).add(this.targetPoint);

                targetPos.x += Math.sin(this.time * u.freq + u.id) * 2.0;
                targetPos.y += Math.cos(this.time * u.freq * 0.8 + u.id) * 2.0;
                targetPos.z += Math.sin(this.time * 0.5 + u.id) * 3.0;

            } else if (this.mode === 'SPHERE') {
                const phi = Math.acos(-1 + (2 * u.id) / this.swordCount);
                const theta = Math.sqrt(this.swordCount * Math.PI) * phi;
                const r = 2.0;

                targetPos.setFromSphericalCoords(r, phi, theta + this.time * 5);
                targetPos.add(this.targetPoint);

            } else if (this.mode === 'SHIELD') {
                const angle = (u.id / this.swordCount) * Math.PI * 2 + this.time;
                const r = 7;
                targetPos.set(Math.cos(angle) * r, Math.sin(angle) * r, 0);
                targetPos.add(this.targetPoint);

            } else {
                const angle = u.id * 0.1 + this.time * 0.1;
                const r = 15 + Math.sin(this.time * 0.5 + u.id) * 5;
                targetPos.set(
                    Math.cos(angle) * r,
                    Math.sin(angle) * r * 0.8,
                    Math.sin(angle * 2 + this.time) * 8
                );
            }

            // --- Spring-damper movement (inertia trail) ---
            toTarget.copy(targetPos).sub(sword.position);

            const kBase = modeK[this.mode] ?? modeK.IDLE;
            const damp = modeDamp[this.mode] ?? modeDamp.IDLE;

            // Give each sword slightly different responsiveness via speed
            const k = kBase * (0.7 + u.speed * 10);

            u.vel.addScaledVector(toTarget, k);
            u.vel.multiplyScalar(damp);
            sword.position.add(u.vel);

            // --- Orientation ---
            if (this.mode === 'SPHERE') {
                outward.copy(sword.position).sub(this.targetPoint).normalize().multiplyScalar(5).add(sword.position);
                sword.lookAt(outward);
            } else {
                sword.lookAt(targetPos);
            }

            // --- Color ---
            sword.material.color.lerp(targetColor, colorLerpSpeed);
        }

        this.stars.rotation.z -= 0.0002;
        this.composer.render();
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }
}
