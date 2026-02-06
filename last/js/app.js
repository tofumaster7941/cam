/**
 * Main Game Logic: Mimic The Face
 * Orchestrates camera, tracker, renderer, and game state
 */

import { Camera } from './camera.js';
import { Tracker } from './tracker.js';

class MimicGame {
    constructor() {
        this.camera = new Camera();
        this.tracker = new Tracker();

        // Game State
        this.score = 0;
        this.timeLeft = 30;
        this.isGameOver = false;
        this.timerInterval = null;
        this.currentTarget = null;
        this.targetStartTime = 0;
        this.matchDuration = 0;
        this.matchThreshold = 1000; // ms to hold expression
        this.isMatching = false;
        this.hasHandedUpThisRound = false;
        this.snapshot = null;

        // Expression targets (cycling through these)
        this.expressions = [
            { name: 'Neutral', detector: this.detectNeutral.bind(this) },
            { name: 'Smile', detector: this.detectSmile.bind(this) },
            { name: 'Surprise', detector: this.detectSurprise.bind(this) },
            { name: 'Kiss', detector: this.detectKiss.bind(this) },
            { name: 'Hands Up!', detector: (blendshapes, hands) => this.detectHandsUp(hands) }
        ];

        this.currentExpressionIndex = 0;
        this.expressionHistory = []; // Track last expressions to prevent repetition

        // UI Elements
        this.targetInstruction = document.getElementById('target-instruction');
        this.scoreDisplay = document.getElementById('score');
        this.timerDisplay = document.getElementById('timer');
        this.loadingOverlay = document.getElementById('loading');
        this.startScreen = document.getElementById('start-screen');
        this.instructionOverlay = document.getElementById('instruction-overlay');
        this.instructionText = document.getElementById('instruction-text');
        this.countdownDisplay = document.getElementById('start-countdown');
        this.gameOverOverlay = document.getElementById('game-over');
        this.finalScoreValue = document.getElementById('final-score-value');
        this.restartBtn = document.getElementById('restart-btn');
        this.successSound = document.getElementById('success-sound');

        // Mode buttons
        document.getElementById('mode-normal').addEventListener('click', () => this.selectMode(false));
        document.getElementById('mode-black').addEventListener('click', () => this.selectMode(true));

        // Canvas for drawing landmarks
        this.landmarkCanvas = document.getElementById('landmark-canvas');
        this.landmarkCtx = this.landmarkCanvas.getContext('2d');
    }

    async init() {
        try {
            // Initialize all systems
            this.loadingOverlay.textContent = 'Starting Camera...';
            await this.camera.start();

            this.loadingOverlay.textContent = 'Loading Face Tracker...';
            await this.tracker.init();

            // Setup landmark canvas
            const video = this.camera.videoElement;
            this.landmarkCanvas.width = video.videoWidth;
            this.landmarkCanvas.height = video.videoHeight;

            // Hide loading
            this.loadingOverlay.style.display = 'none';

            // Show start screen
            this.startScreen.style.display = 'flex';

            // Add spacebar toggle for black background mode
            this.blackMode = false;
            document.addEventListener('keydown', (e) => {
                if (e.code === 'Space') {
                    // Only allow toggle during game
                    if (this.isGameOver || this.startScreen.style.display !== 'none' || this.instructionOverlay.style.display !== 'none') return;

                    e.preventDefault();
                    this.toggleBlackMode(!this.blackMode);
                }
            });

            // Start loop (for background nodes)
            this.gameLoop();

        } catch (error) {
            console.error('Initialization failed:', error);
            this.loadingOverlay.textContent = 'Error: ' + error.message;
        }
    }

    nextTarget() {
        // Mandatory "Hands Up!" logic
        const handsUpIndex = this.expressions.findIndex(e => e.name === 'Hands Up!');

        // Force Hands Up if we are past halfway and haven't done it yet
        if (this.timeLeft < 15 && !this.hasHandedUpThisRound) {
            this.currentExpressionIndex = handsUpIndex;
        } else {
            // Pick a random index, but avoid repeats
            let nextIndex;
            do {
                nextIndex = Math.floor(Math.random() * this.expressions.length);
            } while (
                (nextIndex === handsUpIndex && this.hasHandedUpThisRound) ||
                (this.expressionHistory.length > 0 && nextIndex === this.expressionHistory[this.expressionHistory.length - 1])
            );
            this.currentExpressionIndex = nextIndex;
        }

        if (this.currentExpressionIndex === handsUpIndex) {
            this.hasHandedUpThisRound = true;
        }

        this.expressionHistory.push(this.currentExpressionIndex);
        this.currentTarget = this.expressions[this.currentExpressionIndex];
        this.targetInstruction.textContent = `Mimic: ${this.currentTarget.name}`;

        this.isMatching = false;
        this.matchDuration = 0;
    }

    onSuccess() {
        if (this.isGameOver) return;

        // Guard: prevent multiple triggers for the same target
        if (!this.currentTarget) return;

        const targetWas = this.currentTarget.name;
        this.currentTarget = null; // Mark as processed
        this.isMatching = false;
        this.matchDuration = 0;

        this.score += 10;
        this.scoreDisplay.textContent = `Score: ${this.score}`;

        // Flash effect
        this.targetInstruction.style.color = '#FF0055';
        setTimeout(() => {
            this.targetInstruction.style.color = '#00FFCC';
        }, 200);

        // Next target
        setTimeout(() => {
            if (!this.isGameOver) {
                this.nextTarget();
            }
        }, 500);

        // Play success sound
        if (this.successSound) {
            this.successSound.currentTime = 0;
            this.successSound.play().catch(e => console.warn("Audio playback failed:", e));
        }

        console.log(`[Game] SUCCESS reach for ${targetWas}! New Score: ${this.score}`);
    }

    startTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.timeLeft = 30;
        this.timerDisplay.textContent = `Time: ${this.timeLeft}`;

        console.log("[Game] Timer started!");
        this.timerInterval = setInterval(() => {
            if (this.isGameOver) {
                clearInterval(this.timerInterval);
                return;
            }

            this.timeLeft--;
            this.timerDisplay.textContent = `Time: ${this.timeLeft}`;
            console.log(`[Game] Time: ${this.timeLeft}`);

            if (this.timeLeft <= 0) {
                clearInterval(this.timerInterval);
                this.endGame();
            }
        }, 1000);
    }

    endGame() {
        console.log("[Game] endGame called!");
        this.isGameOver = true;
        this.currentTarget = null;

        // Final UI Updates
        this.targetInstruction.textContent = "GAME OVER";
        this.finalScoreValue.textContent = this.score;

        // Show the overlay
        this.gameOverOverlay.classList.remove('hidden');
        this.gameOverOverlay.style.display = 'flex'; // Ensure it's visible if hidden via display none

        // Hide the main game UI
        const gameUI = document.getElementById('game-ui');
        if (gameUI) gameUI.style.opacity = '0';

        // Show snapshot if we have one
        const snapshotContainer = document.getElementById('snapshot-result');
        const snapshotImg = document.getElementById('game-snapshot');
        if (this.snapshot && snapshotContainer && snapshotImg) {
            snapshotImg.src = this.snapshot;
            snapshotContainer.classList.remove('hidden');
        } else if (snapshotContainer) {
            snapshotContainer.classList.add('hidden');
        }

        // Force black mode for game over screen (face nodes only)
        this.blackMode = true;
        const cameraView = document.getElementById('camera-view');
        cameraView.classList.add('black-mode');
    }

    restartGame() {
        console.log("[Game] restartGame called!");
        this.score = 0;
        this.scoreDisplay.textContent = `Score: ${this.score}`;
        this.isGameOver = false;

        this.gameOverOverlay.classList.add('hidden');
        this.gameOverOverlay.style.display = 'none';

        // Show game UI again
        const gameUI = document.getElementById('game-ui');
        if (gameUI) gameUI.style.opacity = '1';

        // Return to normal mode if they were in it
        this.blackMode = false;
        const cameraView = document.getElementById('camera-view');
        cameraView.classList.remove('black-mode');

        this.startTimer();
        this.nextTarget();
    }
    gameLoop() {
        const video = this.camera.videoElement;
        const result = this.tracker.detect(video);

        if (result) {
            const { face, hands } = result;
            const canvas = this.landmarkCanvas;
            const ctx = this.landmarkCtx;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (face) {
                const { landmarks, blendshapes } = face;

                // Draw landmarks on video
                this.drawLandmarks(landmarks);

                // Stop game interaction if over
                if (this.isGameOver) return;

                // Check if expression matches
                const isMatch = this.currentTarget && this.currentTarget.detector(blendshapes, hands);

                if (isMatch) {
                    if (!this.isMatching) {
                        this.isMatching = true;
                        this.targetStartTime = performance.now();
                    }

                    this.matchDuration = performance.now() - this.targetStartTime;

                    // Visual feedback: progress bar
                    this.drawMatchProgress(this.matchDuration / this.matchThreshold);

                    // Success!
                    if (this.matchDuration >= this.matchThreshold) {
                        // Capture snapshot if this is "Hands Up!"
                        if (this.currentTarget.name === 'Hands Up!' && !this.snapshot) {
                            this.captureSnapshot();
                        }
                        this.onSuccess();
                    }
                } else {
                    this.isMatching = false;
                    this.matchDuration = 0;
                }
            }

            if (hands && hands.length > 0) {
                this.drawHandLandmarks(hands);
            }
        }


        // Continue loop
        requestAnimationFrame(() => this.gameLoop());
    }


    drawLandmarks(landmarks) {
        const canvas = this.landmarkCanvas;
        const ctx = this.landmarkCtx;

        // ctx.clearRect(0, 0, canvas.width, canvas.height); // Already cleared in gameLoop

        // Define facial regions with colors
        const regions = {
            leftEyebrow: { indices: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46], color: '#FFD700', size: 3 },
            rightEyebrow: { indices: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276], color: '#FFD700', size: 3 },
            leftEye: { indices: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246], color: '#00BFFF', size: 3 },
            rightEye: { indices: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466], color: '#00BFFF', size: 3 },
            nose: { indices: [1, 2, 98, 327, 326, 278, 294, 279, 420, 360, 440, 344, 438, 457, 439, 4, 5, 195, 197, 6, 168], color: '#00FF7F', size: 2.5 },
            lipsOuter: { indices: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185], color: '#FF69B4', size: 3 },
            lipsInner: { indices: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191], color: '#FFB6C1', size: 2.5 },
            faceOval: { indices: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109], color: '#00FFCC', size: 2 },
            cheeks: { indices: [116, 123, 50, 101, 36, 205, 206, 203, 142, 126, 217, 198, 236, 3, 196, 174, 122, 188, 245, 193, 351, 419, 248, 456, 399, 412, 343, 277, 350, 349, 348, 347, 346, 345], color: '#FFA500', size: 2 },
            forehead: { indices: [10, 109, 67, 103, 54, 21, 162, 127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 356, 389, 251, 284, 332, 297, 338], color: '#9370DB', size: 2 }
        };

        // First pass: Draw filled triangular mesh to cover entire face
        this.drawFaceMesh(landmarks, ctx, canvas);

        // Second pass: Draw connecting lines (subtle)
        ctx.globalAlpha = 0.3;
        for (const [regionName, region] of Object.entries(regions)) {
            ctx.strokeStyle = region.color;
            ctx.lineWidth = 1;
            ctx.beginPath();

            for (let i = 0; i < region.indices.length; i++) {
                const point = landmarks[region.indices[i]];
                const x = point.x * canvas.width;
                const y = point.y * canvas.height;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            if (['leftEye', 'rightEye', 'lipsOuter', 'faceOval'].includes(regionName)) {
                ctx.closePath();
            }
            ctx.stroke();
        }

        // Third pass: Draw color-coded nodes
        ctx.globalAlpha = 1.0;
        for (const [regionName, region] of Object.entries(regions)) {
            ctx.fillStyle = region.color;

            for (const idx of region.indices) {
                const point = landmarks[idx];
                const x = point.x * canvas.width;
                const y = point.y * canvas.height;

                ctx.beginPath();
                ctx.arc(x, y, region.size, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        // Fourth pass: Add dense interpolated points to fill gaps
        ctx.globalAlpha = 0.7;
        this.drawDenseInterpolation(landmarks, ctx, canvas);
    }

    drawFaceMesh(landmarks, ctx, canvas) {
        // Draw a complete mesh covering the entire face using triangulation
        const faceRegions = [
            [10, 109, 67, 103, 54, 21, 162, 127, 234],
            [10, 338, 297, 332, 284, 251, 389, 356, 454],
            [234, 93, 132, 58, 172, 136, 150, 149, 176],
            [454, 323, 361, 288, 397, 365, 379, 378, 400],
            [168, 6, 197, 195, 5, 4, 98, 2, 326, 327],
            [33, 133, 155, 154, 153, 145, 144, 163],
            [263, 362, 382, 381, 380, 374, 373, 390],
            [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
            [146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
            [152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454],
            [172, 136, 150, 149, 176, 148, 152],
            [397, 365, 379, 378, 400, 377, 152]
        ];

        ctx.globalAlpha = 0.15;
        for (const region of faceRegions) {
            if (region.length < 3) continue;

            ctx.fillStyle = '#FFFFFF';
            for (let i = 1; i < region.length - 1; i++) {
                const p0 = landmarks[region[0]];
                const p1 = landmarks[region[i]];
                const p2 = landmarks[region[i + 1]];

                ctx.beginPath();
                ctx.moveTo(p0.x * canvas.width, p0.y * canvas.height);
                ctx.lineTo(p1.x * canvas.width, p1.y * canvas.height);
                ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    drawDenseInterpolation(landmarks, ctx, canvas) {
        // Create extremely dense interpolation to fill ALL gaps
        const densePaths = [
            [10, 109, 67, 103, 54, 21, 162, 127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 356, 389, 251, 284, 332, 297, 338, 10],
            [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 33],
            [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249, 263],
            [168, 6, 197, 195, 5, 4, 1, 2, 98, 327, 326, 278, 294, 279, 420, 360, 440, 344, 438, 457, 439],
            [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61],
            [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78],
            [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
            [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
            [116, 123, 50, 101, 36, 205, 206, 203, 142, 126, 217, 198, 236, 3, 196, 174, 122, 188, 245, 193],
            [345, 346, 347, 348, 349, 350, 277, 343, 412, 399, 456, 248, 419, 351],
            [21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251],
            [162, 127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 356, 389],
            [10, 151, 9, 8, 168, 6, 197, 195, 5],
            [338, 337, 336, 296, 334, 293, 300],
            [109, 108, 107, 66, 105, 63, 70],
            [152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162],
            [152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 356, 389]
        ];

        ctx.fillStyle = '#FFFFFF';
        for (const path of densePaths) {
            for (let i = 0; i < path.length - 1; i++) {
                const p1 = landmarks[path[i]];
                const p2 = landmarks[path[i + 1]];

                // Add 5 interpolated points between each pair
                for (let t = 0.1; t <= 0.9; t += 0.2) {
                    const x = (p1.x * (1 - t) + p2.x * t) * canvas.width;
                    const y = (p1.y * (1 - t) + p2.y * t) * canvas.height;

                    ctx.beginPath();
                    ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
        }

        // Fill remaining gaps with grid-based interpolation
        this.fillRemainingGaps(landmarks, ctx, canvas);
    }

    fillRemainingGaps(landmarks, ctx, canvas) {
        // Create a grid-based fill for any remaining empty spaces
        const keyRegions = [
            [[10, 109, 67, 103, 54], [21, 162, 127, 234, 93]],
            [[21, 162, 127, 234, 93], [132, 58, 172, 136, 150]],
            [[10, 338, 297, 332, 284], [251, 389, 356, 454, 323]],
            [[251, 389, 356, 454, 323], [361, 288, 397, 365, 379]],
            [[168, 6, 197, 195, 5], [1, 2, 98, 327, 4]],
            [[67, 109, 10, 338, 297], [103, 54, 151, 284, 332]],
            [[234, 127, 162, 389, 356], [93, 132, 58, 288, 361]]
        ];

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        for (const [strip1, strip2] of keyRegions) {
            const minLen = Math.min(strip1.length, strip2.length);

            for (let i = 0; i < minLen - 1; i++) {
                const p1 = landmarks[strip1[i]];
                const p2 = landmarks[strip1[i + 1]];
                const p3 = landmarks[strip2[i]];
                const p4 = landmarks[strip2[i + 1]];

                // Create a grid between these 4 points
                for (let u = 0.2; u <= 0.8; u += 0.3) {
                    for (let v = 0.2; v <= 0.8; v += 0.3) {
                        // Bilinear interpolation
                        const top = {
                            x: p1.x * (1 - u) + p2.x * u,
                            y: p1.y * (1 - u) + p2.y * u
                        };
                        const bottom = {
                            x: p3.x * (1 - u) + p4.x * u,
                            y: p3.y * (1 - u) + p4.y * u
                        };
                        const point = {
                            x: (top.x * (1 - v) + bottom.x * v) * canvas.width,
                            y: (top.y * (1 - v) + bottom.y * v) * canvas.height
                        };

                        ctx.beginPath();
                        ctx.arc(point.x, point.y, 1.2, 0, 2 * Math.PI);
                        ctx.fill();
                    }
                }
            }
        }
    }

    drawHandLandmarks(hands) {
        const canvas = this.landmarkCanvas;
        const ctx = this.landmarkCtx;

        // Hand landmarks connections (MediaPipe index):
        // Thumb: 0-1, 1-2, 2-3, 3-4
        // Index: 0-5, 5-6, 6-7, 7-8
        // Middle: 0-9, 9-10, 10-11, 11-12
        // Ring: 0-13, 13-14, 14-15, 15-16
        // Pinky: 0-17, 17-18, 18-19, 19-20
        // Palm: 0-5, 5-9, 9-13, 13-17, 17-0

        const fingerConnections = [
            [0, 1, 2, 3, 4],    // Thumb
            [0, 5, 6, 7, 8],    // Index
            [0, 9, 10, 11, 12], // Middle
            [0, 13, 14, 15, 16], // Ring
            [0, 17, 18, 19, 20]  // Pinky
        ];

        const palmConnections = [0, 5, 9, 13, 17, 0];

        for (const hand of hands) {
            // Draw connections as semi-transparent lines
            ctx.strokeStyle = '#00FFCC';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.5;

            // Draw fingers
            for (const finger of fingerConnections) {
                ctx.beginPath();
                for (let i = 0; i < finger.length; i++) {
                    const pt = hand[finger[i]];
                    const x = pt.x * canvas.width;
                    const y = pt.y * canvas.height;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            // Draw palm
            ctx.beginPath();
            for (let i = 0; i < palmConnections.length; i++) {
                const pt = hand[palmConnections[i]];
                const x = pt.x * canvas.width;
                const y = pt.y * canvas.height;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Draw nodes/points
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = '#FF0055';
            for (const pt of hand) {
                const x = pt.x * canvas.width;
                const y = pt.y * canvas.height;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }

    drawMatchProgress(progress) {
        const canvas = this.landmarkCanvas;
        const ctx = this.landmarkCtx;

        // Progress bar at top
        const barWidth = canvas.width * 0.6;
        const barHeight = 10;
        const x = (canvas.width - barWidth) / 2;
        const y = 30;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x, y, barWidth, barHeight);

        // Progress
        ctx.fillStyle = '#00FFCC';
        ctx.fillRect(x, y, barWidth * Math.min(progress, 1), barHeight);

        // Border
        ctx.strokeStyle = '#00FFCC';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, barWidth, barHeight);
    }

    // Expression Detectors using BlendShapes

    detectNeutral(blendshapes) {
        const smile = this.getBlendshape(blendshapes, 'mouthSmileLeft') +
            this.getBlendshape(blendshapes, 'mouthSmileRight');
        const mouth = this.getBlendshape(blendshapes, 'jawOpen');
        const brow = this.getBlendshape(blendshapes, 'browInnerUp');

        return smile < 0.3 && mouth < 0.2 && brow < 0.3;
    }

    detectSmile(blendshapes) {
        const smile = this.getBlendshape(blendshapes, 'mouthSmileLeft') +
            this.getBlendshape(blendshapes, 'mouthSmileRight');
        return smile > 0.8;
    }

    detectSurprise(blendshapes) {
        const brow = this.getBlendshape(blendshapes, 'browInnerUp');
        const mouth = this.getBlendshape(blendshapes, 'jawOpen');
        const eyes = this.getBlendshape(blendshapes, 'eyeWideLeft') +
            this.getBlendshape(blendshapes, 'eyeWideRight');

        // Lowered thresholds for easier detection
        return brow > 0.3 && mouth > 0.25;
    }

    detectKiss(blendshapes) {
        const pucker = this.getBlendshape(blendshapes, 'mouthPucker');
        const funnel = this.getBlendshape(blendshapes, 'mouthFunnel');

        return pucker > 0.5 || funnel > 0.5;
    }

    detectHandsUp(hands) {
        if (!hands || hands.length === 0) return false;

        // Count hands in upper part of screen
        let handsRaised = 0;
        for (const hand of hands) {
            const wristY = hand[0].y;
            const indexMcpY = hand[5].y;
            // Mediapipe Y is 0 (top) to 1 (bottom)
            if (wristY < 0.6 && indexMcpY < 0.5) {
                handsRaised++;
            }
        }

        return handsRaised >= 1;
    }

    captureSnapshot() {
        try {
            const video = this.camera.videoElement;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');

            // Draw video first
            ctx.drawImage(video, 0, 0);

            // Draw the landmarks on top
            ctx.drawImage(this.landmarkCanvas, 0, 0);

            this.snapshot = canvas.toDataURL('image/png');
            console.log("[Game] Snapshot captured!");
        } catch (e) {
            console.error("Snapshot failed", e);
        }
    }

    getBlendshape(blendshapes, name) {
        const shape = blendshapes.find(b => b.categoryName === name);
        return shape ? shape.score : 0;
    }

    toggleBlackMode(isBlack) {
        this.blackMode = isBlack;
        const cameraView = document.getElementById('camera-view');
        if (this.blackMode) {
            cameraView.classList.add('black-mode');
        } else {
            cameraView.classList.remove('black-mode');
        }
    }

    selectMode(isBlack) {
        this.toggleBlackMode(isBlack);
        this.startScreen.style.display = 'none';
        this.showInstructions();
    }

    showInstructions() {
        this.instructionOverlay.style.display = 'flex';
        let count = 3;
        this.countdownDisplay.textContent = count;

        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                this.countdownDisplay.textContent = count;
            } else {
                clearInterval(countdownInterval);
                this.instructionOverlay.style.display = 'none';
                this.startGame();
            }
        }, 1000);
    }

    startGame() {
        this.score = 0;
        this.timeLeft = 30;
        this.isGameOver = false;
        this.snapshot = null;
        this.hasHandedUpThisRound = false;
        this.expressionHistory = [];
        this.scoreDisplay.textContent = `Score: ${this.score}`;

        // Show game UI again
        const gameUI = document.getElementById('game-ui');
        if (gameUI) gameUI.style.opacity = '1';

        // Reset background mode classes if needed
        const cameraView = document.getElementById('camera-view');
        if (!this.blackMode) {
            cameraView.classList.remove('black-mode');
        }

        this.nextTarget();
        this.startTimer();
    }
}

// Start the game
const game = new MimicGame();
game.init();
