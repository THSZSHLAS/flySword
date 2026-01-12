export class HandTracker {
    constructor(onStateChange) {
        this.video = document.getElementById('input-video');
        this.onStateChange = onStateChange; // Callback function

        this.state = {
            detected: false,
            x: 0,
            y: 0,
            gesture: 'IDLE'
        };

        // Delay initialization slightly to ensure DOM ready
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
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
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
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const lm = results.multiHandLandmarks[0];

            // 1. Calculate Center (Palm position roughly at index 9)
            // Mirror X for intuitive control
            const x = (1 - lm[9].x) * 2 - 1; // NDC: -1 to 1
            const y = -(lm[9].y * 2 - 1);    // NDC: -1 to 1

            // 2. Gesture Recognition
            const gesture = this.detectGesture(lm);

            this.state = {
                detected: true,
                x: x,
                y: y,
                gesture: gesture
            };
        } else {
            this.state.detected = false;
            this.state.gesture = 'IDLE';
        }

        // Send data back to Main
        if (this.onStateChange) this.onStateChange(this.state);
    }

    detectGesture(lm) {
        // Helper: Check if finger is bent (Tip is lower/closer to wrist than PIP joint)
        // Note: Coordinates are normalized 0-1. Wrist is 0.
        // We use distance to wrist (0) comparison.

        const dist = (idx) => Math.sqrt(
            Math.pow(lm[idx].x - lm[0].x, 2) + Math.pow(lm[idx].y - lm[0].y, 2)
        );

        // Indices: Index(8), Middle(12), Ring(16), Pinky(20)
        // MCP joints are 5, 9, 13, 17.
        // If Tip distance < MCP distance, finger is curled.

        const indexOpen = dist(8) > dist(5);
        const middleOpen = dist(12) > dist(9);
        const ringOpen = dist(16) > dist(13);
        const pinkyOpen = dist(20) > dist(17);

        // Logic Tree
        if (indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
            return 'STREAM'; // Only Index open -> Pointing
        }
        if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
            return 'SPHERE'; // All closed -> Fist
        }
        if (indexOpen && middleOpen && ringOpen && pinkyOpen) {
            return 'SHIELD'; // All open -> Palm
        }

        return 'STREAM'; // Default fallback if hand is weird, treat as pointing
    }
}