import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export class SceneManager {
    constructor() {
        this.container = document.getElementById('canvas-container');
        
        // 1. 初始化场景
        this.scene = new THREE.Scene();
        // 稍微加一点迷雾，增强深邃感
        this.scene.fog = new THREE.FogExp2(0x020202, 0.03);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 25; // 相机拉远一点，视野更开阔

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        // 2. 状态管理
        this.swords = [];
        this.swordCount = 80; // 增加剑的数量，效果更明显
        this.targetPoint = new THREE.Vector3(0, 0, 0); 
        this.mode = 'IDLE'; 
        this.time = 0;

        // 3. 初始化组件
        this.createSwordMesh();
        this.initPostProcessing();
        this.initStarField();

        window.addEventListener('resize', () => this.onResize());
    }

    createSwordMesh() {
        // 创建剑的几何体
        const geometry = new THREE.ConeGeometry(0.12, 4.5, 5); // 稍微修长一点
        geometry.rotateX(Math.PI / 2); 
        
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x00ffff,
        });

        for (let i = 0; i < this.swordCount; i++) {
            const sword = new THREE.Mesh(geometry, material.clone());
            
            // 初始随机位置（散得更开）
            sword.position.set(
                (Math.random() - 0.5) * 60,
                (Math.random() - 0.5) * 60,
                (Math.random() - 0.5) * 40 - 10
            );

            // 【关键修改】赋予每把剑独特的“性格”
            sword.userData = {
                id: i,
                // 1. 速度差异极大：有的灵敏(0.06)，有的慵懒(0.01)
                speed: 0.01 + Math.random() * 0.05, 
                // 2. 随机偏移范围变大 (x,y,z)
                randomOffset: new THREE.Vector3(
                    (Math.random() - 0.5) * 15, // 左右散开范围 15
                    (Math.random() - 0.5) * 15, // 上下散开范围 15
                    (Math.random() - 0.5) * 10  // 前后层次感
                ),
                // 3. 游动频率（让它们上下浮动不同步）
                freq: Math.random() * 2 + 0.5 
            };

            this.swords.push(sword);
            this.scene.add(sword);
        }
    }

    initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        
        // 辉光参数微调：范围更大，强度稍低，更柔和
        const bloom = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5, 0.4, 0.85
        );
        bloom.threshold = 0;
        bloom.strength = 1.0; 
        bloom.radius = 0.8; // 光晕扩散更广
        this.composer.addPass(bloom);
    }

    initStarField() {
        const geo = new THREE.BufferGeometry();
        const vertices = [];
        for(let i=0; i<1500; i++) {
            vertices.push((Math.random()-0.5)*150, (Math.random()-0.5)*150, (Math.random()-0.5)*100);
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const mat = new THREE.PointsMaterial({color: 0x666666, size: 0.15, transparent: true, opacity: 0.6});
        this.stars = new THREE.Points(geo, mat);
        this.scene.add(this.stars);
    }

    updateTarget(ndcX, ndcY) {
        // 映射坐标，但在Z轴上给一点深度，不要贴在屏幕上
        const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
        vector.unproject(this.camera);
        const dir = vector.sub(this.camera.position).normalize();
        const distance = -this.camera.position.z / dir.z; // 投射到 z=0 平面
        const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));
        
        // 目标点本身也可以带一点延迟平滑
        this.targetPoint.lerp(pos, 0.05);
    }

    setMode(mode) {
        this.mode = mode;
    }

    update() {
        this.time += 0.01;

        // 颜色定义
        const colors = {
            'IDLE': new THREE.Color(0x00ffff), 
            'STREAM': new THREE.Color(0x00ffff), 
            'SPHERE': new THREE.Color(0xff3333), 
            'SHIELD': new THREE.Color(0xffaa00)  
        };
        // 颜色过渡速度
        const colorLerpSpeed = 0.05;

        const targetColor = colors[this.mode] || colors['IDLE'];

        this.swords.forEach(sword => {
            const u = sword.userData;
            let targetPos = new THREE.Vector3();
            let moveSpeed = u.speed; // 默认使用自身的性格速度

            // --- 阵法逻辑 ---
            
            if (this.mode === 'STREAM') {
                // 【核心修改：御剑·流】
                // 1. 基础目标 = 手指位置 + 个体偏移
                targetPos.copy(this.targetPoint).add(u.randomOffset);

                // 2. 加入“呼吸”感：偏移量会随时间慢慢扩大缩小
                const breathing = Math.sin(this.time * 0.5) * 0.2 + 1; // 0.8 ~ 1.2
                targetPos.sub(this.targetPoint).multiplyScalar(breathing).add(this.targetPoint);

                // 3. 加入“游动”感：像鱼一样正弦摆动
                // x, y, z 都在波动，且相位不同(u.id)
                targetPos.x += Math.sin(this.time * u.freq + u.id) * 2.0; 
                targetPos.y += Math.cos(this.time * u.freq * 0.8 + u.id) * 2.0;
                targetPos.z += Math.sin(this.time * 0.5 + u.id) * 3.0; // 深度上也有浮动

                // 4. 速度稍微降低，制造拖尾效果
                moveSpeed = u.speed * 0.8; 

            } else if (this.mode === 'SPHERE') {
                // 聚气：非常紧凑，速度极快
                const phi = Math.acos(-1 + (2 * u.id) / this.swordCount);
                const theta = Math.sqrt(this.swordCount * Math.PI) * phi;
                const r = 2.0; // 很小的球
                
                targetPos.setFromSphericalCoords(r, phi, theta + this.time * 5); // 快速旋转
                targetPos.add(this.targetPoint);
                moveSpeed = 0.1; // 强制快速归位

            } else if (this.mode === 'SHIELD') {
                // 盾牌：有序排列
                const angle = (u.id / this.swordCount) * Math.PI * 2 + this.time;
                const r = 7;
                targetPos.set(Math.cos(angle) * r, Math.sin(angle) * r, 0);
                targetPos.add(this.targetPoint);
                moveSpeed = 0.05;

            } else {
                // 待机：漫天飞舞
                const angle = u.id * 0.1 + this.time * 0.1;
                const r = 15 + Math.sin(this.time * 0.5 + u.id)*5;
                targetPos.set(
                    Math.cos(angle)*r, 
                    Math.sin(angle)*r * 0.8, 
                    Math.sin(angle * 2 + this.time)*8
                );
                moveSpeed = 0.02;
            }

            // --- 物理移动 ---
            
            // 1. 位置插值 (Lerp)
            sword.position.lerp(targetPos, moveSpeed);

            // 2. 朝向计算 (LookAt)
            // 技巧：我们让它看向“未来一点点的位置”，这样转弯更自然
            // 如果在 SPHERE 模式，强制剑尖朝外 (杀气)
            if (this.mode === 'SPHERE') {
                const center = this.targetPoint.clone();
                const outward = sword.position.clone().sub(center).normalize().multiplyScalar(5).add(sword.position);
                sword.lookAt(outward);
            } else {
                // 正常飞行模式：看向目标
                const lookTarget = targetPos.clone();
                sword.lookAt(lookTarget);
            }

            // 3. 颜色变化
            sword.material.color.lerp(targetColor, colorLerpSpeed);
        });

        // 背景星空旋转
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
