/**
 * Face Tracker using MediaPipe FaceLandmarker
 * Extracts 478 landmarks and blendshapes
 */

import {
    FaceLandmarker,
    HandLandmarker,
    FilesetResolver
} from '@mediapipe/tasks-vision';

export class Tracker {
    constructor() {
        this.landmarker = null;
        this.handLandmarker = null;
        this.lastVideoTime = -1;
    }

    async init() {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
        );

        this.landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                delegate: "GPU"
            },
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
            runningMode: "VIDEO",
            numFaces: 1
        });

        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2
        });
    }

    detect(video) {
        if (!this.landmarker) return null;

        if (video.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = video.currentTime;
            const startTimeMs = performance.now();

            const faceResult = this.landmarker.detectForVideo(video, startTimeMs);
            const handResult = this.handLandmarker.detectForVideo(video, startTimeMs);

            return {
                face: faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0 ? {
                    landmarks: faceResult.faceLandmarks[0],
                    blendshapes: faceResult.faceBlendshapes[0].categories,
                    matrix: faceResult.facialTransformationMatrixes[0]
                } : null,
                hands: handResult.landmarks && handResult.landmarks.length > 0 ? handResult.landmarks : []
            };
        }
        return null;
    }
}
