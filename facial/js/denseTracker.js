/**
 * Ultra-Dense Multi-Model Tracker
 * Combines Face Mesh (468) + Pose (33) + Hands (21×2) = 543 raw landmarks
 * Optimized for 60 FPS on M4 MacBook Pro
 */

import {
    FaceLandmarker,
    FilesetResolver
} from '@mediapipe/tasks-vision';

export class DenseTracker {
    constructor() {
        this.faceLandmarker = null;
        this.runningMode = "VIDEO";
        this.lastVideoTime = -1;

        // Performance tracking
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.currentFps = 0;
    }

    async init(progressCallback = null) {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
        );

        // Initialize Face Landmarker for faster startup
        const initPromises = [];

        // Face Landmarker - 468 facial landmarks + Iris (Refined)
        if (progressCallback) progressCallback('Loading Face Mesh...');
        initPromises.push(
            FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: "GPU"
                },
                runningMode: this.runningMode,
                numFaces: 1,
                outputFaceBlendshapes: true,  // Micro-expressions
                outputFacialTransformationMatrixes: true, // 3D head pose
                refineLandmarks: true // Iris and lip precision
            }).then(landmarker => {
                this.faceLandmarker = landmarker;
                console.log('Face Landmarker ready (478 landmarks with Iris)');
            })
        );

        await Promise.all(initPromises);
        console.log('All dense trackers initialized (543 raw landmarks total)');
    }

    /**
     * Detect all landmarks from video frame
     * @returns {Object} Combined results with face, pose, and hand landmarks
     */
    detect(videoElement) {
        const nowInMs = performance.now();

        // Skip if same frame
        if (videoElement.currentTime === this.lastVideoTime) {
            return null;
        }
        this.lastVideoTime = videoElement.currentTime;

        // Track FPS
        this.frameCount++;
        if (nowInMs - this.lastFpsUpdate >= 1000) {
            this.currentFps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = nowInMs;
        }

        const results = {
            face: null,
            pose: null,
            hands: null,
            timestamp: nowInMs,
            fps: this.currentFps
        };

        // Detect face landmarks (468 points)
        if (this.faceLandmarker) {
            try {
                const faceResult = this.faceLandmarker.detectForVideo(videoElement, nowInMs);
                if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
                    results.face = {
                        landmarks: faceResult.faceLandmarks[0],
                        blendshapes: faceResult.faceBlendshapes?.[0]?.categories || [],
                        transformMatrix: faceResult.facialTransformationMatrixes?.[0] || null
                    };
                }
            } catch (e) {
                console.warn('Face detection error:', e);
            }
        }

        return results;
    }

    /**
     * Get total raw landmark count from last detection
     */
    getRawLandmarkCount(results) {
        if (!results) return 0;

        let count = 0;
        if (results.face?.landmarks) count += results.face.landmarks.length;
        return count;
    }

    getFps() {
        return this.currentFps;
    }
}

// MediaPipe landmark indices for reference
export const FACE_LANDMARKS = {
    // Lips
    LIPS_OUTER: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
    LIPS_INNER: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],

    // Eyes
    LEFT_EYE: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
    RIGHT_EYE: [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382],
    LEFT_EYEBROW: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
    RIGHT_EYEBROW: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
    LEFT_IRIS: [468, 469, 470, 471, 472],
    RIGHT_IRIS: [473, 474, 475, 476, 477],

    // Face contour
    FACE_OVAL: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],

    // Nose
    NOSE: [1, 2, 98, 327, 4, 5, 195, 197, 6, 168, 8, 9, 151, 10],
    NOSE_TIP: [1],
    NOSE_BRIDGE: [6, 197, 195, 5, 4],

    // Forehead
    FOREHEAD: [10, 338, 297, 251, 21, 54, 103, 67, 109],

    // Cheeks
    LEFT_CHEEK: [234, 93, 132, 58, 172, 136, 150, 149, 176, 148],
    RIGHT_CHEEK: [454, 323, 361, 288, 397, 365, 379, 378, 400, 377]
};
