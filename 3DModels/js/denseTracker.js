/**
 * Ultra-Dense Multi-Model Tracker
 * Combines Face Mesh (468) + Pose (33) + Hands (21×2) = 543 raw landmarks
 * Optimized for 60 FPS on M4 MacBook Pro
 */

import {
    FaceLandmarker,
    PoseLandmarker,
    HandLandmarker,
    FilesetResolver
} from '@mediapipe/tasks-vision';

export class DenseTracker {
    constructor() {
        this.faceLandmarker = null;
        this.poseLandmarker = null;
        this.handLandmarker = null;
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

        // Initialize all three models in parallel for faster startup
        const initPromises = [];

        // Face Landmarker - 468 facial landmarks
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
                outputFacialTransformationMatrixes: true  // 3D head pose
            }).then(landmarker => {
                this.faceLandmarker = landmarker;
                console.log('Face Landmarker ready (468 landmarks)');
            })
        );

        // Pose Landmarker - 33 body landmarks
        if (progressCallback) progressCallback('Loading Pose Model...');
        initPromises.push(
            PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
                    delegate: "GPU"
                },
                runningMode: this.runningMode,
                numPoses: 1,
                minPoseDetectionConfidence: 0.5,
                minPosePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5
            }).then(landmarker => {
                this.poseLandmarker = landmarker;
                console.log('Pose Landmarker ready (33 landmarks)');
            })
        );

        // Hand Landmarker - 21 landmarks per hand
        if (progressCallback) progressCallback('Loading Hand Model...');
        initPromises.push(
            HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                    delegate: "GPU"
                },
                runningMode: this.runningMode,
                numHands: 2,
                minHandDetectionConfidence: 0.5,
                minHandPresenceConfidence: 0.5,
                minTrackingConfidence: 0.5
            }).then(landmarker => {
                this.handLandmarker = landmarker;
                console.log('Hand Landmarker ready (21×2 landmarks)');
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

        // Detect pose landmarks (33 points + world coordinates)
        if (this.poseLandmarker) {
            try {
                const poseResult = this.poseLandmarker.detectForVideo(videoElement, nowInMs);
                if (poseResult.landmarks && poseResult.landmarks.length > 0) {
                    results.pose = {
                        landmarks: poseResult.landmarks[0],
                        worldLandmarks: poseResult.worldLandmarks?.[0] || null
                    };
                }
            } catch (e) {
                console.warn('Pose detection error:', e);
            }
        }

        // Detect hand landmarks (21 points × 2 hands)
        if (this.handLandmarker) {
            try {
                const handResult = this.handLandmarker.detectForVideo(videoElement, nowInMs);
                if (handResult.landmarks && handResult.landmarks.length > 0) {
                    results.hands = {
                        landmarks: handResult.landmarks,
                        handedness: handResult.handednesses || [],
                        worldLandmarks: handResult.worldLandmarks || []
                    };
                }
            } catch (e) {
                console.warn('Hand detection error:', e);
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
        if (results.pose?.landmarks) count += results.pose.landmarks.length;
        if (results.hands?.landmarks) {
            results.hands.landmarks.forEach(hand => count += hand.length);
        }
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

export const POSE_LANDMARKS = {
    NOSE: 0,
    LEFT_EYE_INNER: 1,
    LEFT_EYE: 2,
    LEFT_EYE_OUTER: 3,
    RIGHT_EYE_INNER: 4,
    RIGHT_EYE: 5,
    RIGHT_EYE_OUTER: 6,
    LEFT_EAR: 7,
    RIGHT_EAR: 8,
    MOUTH_LEFT: 9,
    MOUTH_RIGHT: 10,
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_PINKY: 17,
    RIGHT_PINKY: 18,
    LEFT_INDEX: 19,
    RIGHT_INDEX: 20,
    LEFT_THUMB: 21,
    RIGHT_THUMB: 22,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
    LEFT_KNEE: 25,
    RIGHT_KNEE: 26,
    LEFT_ANKLE: 27,
    RIGHT_ANKLE: 28,
    LEFT_HEEL: 29,
    RIGHT_HEEL: 30,
    LEFT_FOOT_INDEX: 31,
    RIGHT_FOOT_INDEX: 32
};

export const HAND_LANDMARKS = {
    WRIST: 0,
    THUMB_CMC: 1,
    THUMB_MCP: 2,
    THUMB_IP: 3,
    THUMB_TIP: 4,
    INDEX_MCP: 5,
    INDEX_PIP: 6,
    INDEX_DIP: 7,
    INDEX_TIP: 8,
    MIDDLE_MCP: 9,
    MIDDLE_PIP: 10,
    MIDDLE_DIP: 11,
    MIDDLE_TIP: 12,
    RING_MCP: 13,
    RING_PIP: 14,
    RING_DIP: 15,
    RING_TIP: 16,
    PINKY_MCP: 17,
    PINKY_PIP: 18,
    PINKY_DIP: 19,
    PINKY_TIP: 20
};
