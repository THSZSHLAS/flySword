import { SceneManager } from './scene.js';
import { HandTracker } from './handTracker.js';

class App {
    constructor() {
        // UI Elements
        this.uiSys = document.getElementById('sys-status');
        this.uiHand = document.getElementById('hand-status');
        this.uiTitle = document.getElementById('formation-name');
        this.uiLayer = document.getElementById('ui-layer');

        // Reticle UI
        this.reticle = document.createElement('div');
        this.reticle.id = 'reticle';
        this.uiLayer.appendChild(this.reticle);

        this.trails = [];
        const trailCount = 10;
        for (let i = 0; i < trailCount; i++) {
            const t = document.createElement('div');
            t.className = 'reticle-trail';
            this.uiLayer.appendChild(t);
            this.trails.push({ el: t, x: window.innerWidth / 2, y: window.innerHeight / 2 });
        }

        this.reticleX = window.innerWidth / 2;
        this.reticleY = window.innerHeight / 2;

        // State cache (for per-frame UI smoothing)
        this.latestState = { detected: false, x: 0, y: 0, gesture: 'IDLE', confidence: 0 };

        // Init Modules
        this.scene = new SceneManager();
        this.tracker = new HandTracker((state) => this.onHandUpdate(state));

        // Start Loop
        this.animate();
    }

    onHandUpdate(state) {
        this.latestState = state;

        // Update UI text
        if (state.detected) {
            const pct = Math.round((state.confidence ?? 1) * 100);
            this.uiHand.innerText = `LOCKED ${pct}% [${state.x.toFixed(2)}, ${state.y.toFixed(2)}]`;
            this.uiHand.style.color = '#0ff';

            // Send data to Scene
            this.scene.updateTarget(state.x, state.y);
            this.scene.setMode(state.gesture);
            this.updateFormationText(state.gesture);
        } else {
            this.uiHand.innerText = "SEARCHING...";
            this.uiHand.style.color = '#fff';

            this.scene.setMode('IDLE');
            this.updateFormationText('IDLE');
        }
    }

    updateFormationText(gesture) {
        let text = "AWAITING COMMAND";
        let colorClass = "";

        switch (gesture) {
            case 'STREAM':
                text = "FORMATION: AZURE STREAM (御剑·流)";
                colorClass = "mode-stream";
                break;
            case 'SPHERE':
                text = "FORMATION: CRIMSON CORE (御剑·杀)";
                colorClass = "mode-sphere";
                break;
            case 'SHIELD':
                text = "FORMATION: GOLDEN AEGIS (御剑·盾)";
                colorClass = "mode-shield";
                break;
            case 'IDLE':
                text = "SYSTEM IDLE";
                colorClass = "";
                break;
        }

        if (this.uiTitle.innerText !== text) {
            this.uiTitle.innerText = text;
            this.uiTitle.className = "";
            if (colorClass) this.uiTitle.classList.add(colorClass);
        }
    }

    updateReticle() {
        const s = this.latestState;
        const show = !!s.detected;

        this.reticle.style.opacity = show ? '1' : '0';
        for (const t of this.trails) t.el.style.opacity = show ? '1' : '0';
        if (!show) return;

        // NDC -> screen
        const tx = (s.x * 0.5 + 0.5) * window.innerWidth;
        const ty = (-s.y * 0.5 + 0.5) * window.innerHeight;

        // Smooth the head reticle
        this.reticleX += (tx - this.reticleX) * 0.35;
        this.reticleY += (ty - this.reticleY) * 0.35;

        this.reticle.style.transform = `translate3d(${this.reticleX}px, ${this.reticleY}px, 0) translate(-50%, -50%)`;

        // Trail chain (each node follows previous)
        let px = this.reticleX;
        let py = this.reticleY;

        for (let i = 0; i < this.trails.length; i++) {
            const node = this.trails[i];
            const follow = Math.max(0.10, 0.22 - i * 0.012);

            node.x += (px - node.x) * follow;
            node.y += (py - node.y) * follow;

            node.el.style.transform = `translate3d(${node.x}px, ${node.y}px, 0) translate(-50%, -50%)`;

            px = node.x;
            py = node.y;
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        this.updateReticle();
        this.scene.update();
    }
}

window.addEventListener('load', () => {
    new App();
});
