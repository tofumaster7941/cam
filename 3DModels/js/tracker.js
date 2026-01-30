
import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

export class Tracker {
    constructor() {
        this.poseLandmarker = null;
        this.runningMode = "VIDEO";
    }

    async init() {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
        );

        this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
                delegate: "GPU"
            },
            runningMode: this.runningMode,
            numPoses: 1
        });
    }

    detect(videoElement) {
        if (!this.poseLandmarker) return null;

        const nowInMs = performance.now();
        const results = this.poseLandmarker.detectForVideo(videoElement, nowInMs);

        return results;
    }
}
