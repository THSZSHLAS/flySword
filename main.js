import { SceneManager } from './scene.js';
import { HandTracker } from './handTracker.js';

class App {
    constructor() {
        // UI Elements
        this.uiSys = document.getElementById('sys-status');
        this.uiHand = document.getElementById('hand-status');
        this.uiTitle = document.getElementById('formation-name');
        this.uiLayer = document.getElementById('ui-layer');

        // Init Modules
        this.scene = new SceneManager();
        this.tracker = new HandTracker((state) => this.onHandUpdate(state));

        // Start Loop
        this.animate();
    }

    onHandUpdate(state) {
        // Update UI
        if (state.detected) {
            this.uiHand.innerText = `LOCKED [${state.x.toFixed(2)}, ${state.y.toFixed(2)}]`;
            this.uiHand.style.color = '#0ff';
        } else {
            this.uiHand.innerText = "SEARCHING...";
            this.uiHand.style.color = '#fff';
        }

        // Send data to Scene
        if (state.detected) {
            this.scene.updateTarget(state.x, state.y);
            this.scene.setMode(state.gesture);
            this.updateFormationText(state.gesture);
        } else {
            this.scene.setMode('IDLE');
            this.updateFormationText('IDLE');
        }
    }

    updateFormationText(gesture) {
        let text = "AWAITING COMMAND";
        let colorClass = "";

        switch(gesture) {
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

        // Apply visual updates only if changed to avoid DOM thrashing
        if (this.uiTitle.innerText !== text) {
            this.uiTitle.innerText = text;
            this.uiTitle.className = ""; // Reset
            if (colorClass) this.uiTitle.classList.add(colorClass);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.scene.update();
    }
}

// Boot
window.addEventListener('load', () => {
    new App();
});