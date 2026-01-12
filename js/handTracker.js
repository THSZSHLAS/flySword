export class HandTracker {
    constructor(onStateChange) {
        this.video = document.getElementById('input-video');
        this.onStateChange = onStateChange;

        this.state = {
            detected: false,
            x: 0,
            y: 0,
            gesture: 'IDLE',
            confidence: 0
        };

        // --- Filters / Stabilizers ---
        this.filterX = new OneEuroFilter(30, 1.2, 0.08, 1.0);
        this.filterY = new OneEuroFilter(30, 1.2, 0.08, 1.0);

        this._lastT = null;
        this._lostFrames = 0;

        // Gesture debounce
        this._gestureStable = 'IDLE';
        this._gestureCandidate = 'IDLE';
        this._gestureCount = 0;
        this.gestureStableFrames = 3; // increase to 4-5 if you want even more stability

        // Delay init slightly to ensure DOM ready
        setTimeout(() => this.initCamera(), 500);
    }

    async initCamera() {
        if (!window.Hands) {
            console.error("MediaPipe Hands not loaded.");
            return;
        }

        const hands = new window.Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.75,
            minTrackingConfidence: 0.8
        });

        hands.onResults((results) => this.processResults(results));

        const camera = new window.Camera(this.video, {
            onFrame: async () => {
                await hands.send({ image: this.video });
            },
            width: 640,
            height: 480
        });

        camera.start()
            .then(() => console.log("Camera started"))
            .catch(err => console.error("Camera error:", err));
    }

    processResults(results) {
        const now = performance.now();

        const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

        if (hasHand) {
            const lm = results.multiHandLandmarks[0];

            // Prefer index fingertip (8). Add tiny blend with DIP (7) to reduce micro-jitter.
            const fx = lm[8].x * 0.88 + lm[7].x * 0.12;
            const fy = lm[8].y * 0.88 + lm[7].y * 0.12;

            // Mirror X for intuitive control
            let x = (1 - fx) * 2 - 1;
            let y = -(fy * 2 - 1);

            // Clamp
            x = Math.max(-1, Math.min(1, x));
            y = Math.max(-1, Math.min(1, y));

            // One Euro filter (dynamic smoothing)
            const xFiltered = this.filterX.filter(x, now);
            const yFiltered = this.filterY.filter(y, now);

            // Confidence (optional UI)
            const confidence = (results.multiHandedness && results.multiHandedness[0] && results.multiHandedness[0].score)
                ? results.multiHandedness[0].score
                : 1.0;

            // Gesture
            const rawGesture = this.detectGesture(lm);
            const gesture = this.stabilizeGesture(rawGesture);

            this._lostFrames = 0;

            this.state = {
                detected: true,
                x: xFiltered,
                y: yFiltered,
                gesture,
                confidence
            };
        } else {
            // Lost handling: avoid instant “drop to IDLE” for 1–2 frame glitches
            this._lostFrames += 1;

            if (this._lostFrames >= 3) {
                this._gestureStable = 'IDLE';
                this._gestureCandidate = 'IDLE';
                this._gestureCount = 0;

                this.state.detected = false;
                this.state.gesture = 'IDLE';
                this.state.confidence = 0;
            }
        }

        if (this.onStateChange) this.onStateChange(this.state);
    }

    stabilizeGesture(nextGesture) {
        if (nextGesture === this._gestureCandidate) {
            this._gestureCount += 1;
        } else {
            this._gestureCandidate = nextGesture;
            this._gestureCount = 1;
        }

        if (this._gestureCount >= this.gestureStableFrames) {
            this._gestureStable = nextGesture;
        }

        return this._gestureStable;
    }

    detectGesture(lm) {
        // Distance to wrist helper
        const distToWrist = (idx) => {
            const dx = lm[idx].x - lm[0].x;
            const dy = lm[idx].y - lm[0].y;
            return Math.hypot(dx, dy);
        };

        // Use ratio thresholds to reduce misclassification jitter
        const isFingerOpen = (tip, mcp, ratio = 1.12) => distToWrist(tip) > distToWrist(mcp) * ratio;

        const indexOpen = isFingerOpen(8, 5, 1.10);
        const middleOpen = isFingerOpen(12, 9, 1.12);
        const ringOpen = isFingerOpen(16, 13, 1.12);
        const pinkyOpen = isFingerOpen(20, 17, 1.12);

        // Thumb helps fist detection stability
        const thumbOpen = isFingerOpen(4, 2, 1.08);

        // Pointing: index open, others closed (thumb can be either)
        if (indexOpen && !middleOpen && !ringOpen && !pinkyOpen) return 'STREAM';

        // Fist: all closed (including thumb improves precision)
        if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen && !thumbOpen) return 'SPHERE';

        // Palm: four fingers open (thumb optional)
        if (indexOpen && middleOpen && ringOpen && pinkyOpen) return 'SHIELD';

        // Fallback: keep it “usable” instead of random mode flips
        return 'STREAM';
    }
}

/* ---------------------------
   One Euro Filter utilities
---------------------------- */

class LowPassFilter {
    constructor(alpha) {
        this.alpha = alpha;
        this.initialized = false;
        this.s = 0;
    }
    setAlpha(alpha) { this.alpha = alpha; }
    filter(x) {
        if (!this.initialized) {
            this.initialized = true;
            this.s = x;
            return x;
        }
        this.s = this.alpha * x + (1 - this.alpha) * this.s;
        return this.s;
    }
    last() { return this.s; }
    hasLast() { return this.initialized; }
}

class OneEuroFilter {
    constructor(freq = 30, minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
        this.freq = freq;
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;

        this.x = new LowPassFilter(this.alpha(minCutoff));
        this.dx = new LowPassFilter(this.alpha(dCutoff));

        this.lastTime = null;
    }

    alpha(cutoff) {
        const te = 1.0 / this.freq;
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / te);
    }

    filter(value, timestampMs) {
        if (this.lastTime != null && timestampMs != null) {
            const dt = (timestampMs - this.lastTime) / 1000;
            if (dt > 0) this.freq = 1.0 / dt;
        }
        this.lastTime = timestampMs;

        const prev = this.x.hasLast() ? this.x.last() : value;
        const dValue = (value - prev) * this.freq;

        this.dx.setAlpha(this.alpha(this.dCutoff));
        const edValue = this.dx.filter(dValue);

        const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
        this.x.setAlpha(this.alpha(cutoff));
        return this.x.filter(value);
    }
}
