import * as THREE from 'three';
import { FACE_TRIANGLES } from './faceGeometry.js';

export class Renderer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.faceMesh = null;
        this.particles = null;
    }

    init(containerId) {
        const container = document.getElementById(containerId);
        const canvas = container.querySelector('canvas');
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.z = 2; // Default range

        // WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // -- 1. The Wireframe Face --
        this.initFaceMesh();

        // -- 2. The Particle System --
        this.initParticleSystem();

        // Resize handler
        window.addEventListener('resize', () => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        });
    }

    initFaceMesh() {
        // Geometry from TRIANGLES
        const triangles = FACE_TRIANGLES;
        // FaceLandmarker has 478 points. We prepare a buffer.
        // But for wireframe, we can just use the landmarks as vertices.
        // We'll create a geometry where we update positions every frame.

        const geometry = new THREE.BufferGeometry();
        // 478 vertices * 3 (x, y, z)
        const positions = new Float32Array(478 * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // Index the geometry using the predefined triangles
        geometry.setIndex(triangles);

        // Material: Wireframe
        const material = new THREE.MeshBasicMaterial({
            color: 0x00FFCC,
            wireframe: true,
            transparent: true,
            opacity: 0.6
        });

        this.faceMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.faceMesh);
    }

    initParticleSystem() {
        // A burst of particles
        const count = 1000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const life = new Float32Array(count); // Remaining life

        // Init off-screen
        for (let i = 0; i < count * 3; i++) positions[i] = 9999;

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('life', new THREE.BufferAttribute(life, 1));

        const material = new THREE.PointsMaterial({
            color: 0xFF0055,
            size: 0.03,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(geometry, material);
        this.particles.userData = {
            active: false
        };
        this.scene.add(this.particles);
    }

    /**
     * Updates the 3D face mesh to show the target expression
     */
    updateFaceWithExpression(landmarks, blendshapes, targetExpression) {
        if (!landmarks || !this.faceMesh) return;

        const positions = this.faceMesh.geometry.attributes.position.array;

        // Project landmarks (0..1) to 3D world space loosely
        // Center is 0.5, 0.5
        const aspect = this.camera.aspect;

        // Simple projection scale
        const scaleX = 2.0;
        const scaleY = 2.0;

        // Base positions from landmarks
        for (let i = 0; i < landmarks.length; i++) {
            const p = landmarks[i];
            const idx = i * 3;

            // Mirror X
            positions[idx] = -(p.x - 0.5) * scaleX * aspect;
            positions[idx + 1] = -(p.y - 0.5) * scaleY; // Invert Y
            positions[idx + 2] = -p.z * 1.0; // Depth
        }

        // Apply expression morphing
        this.applyExpressionMorph(positions, landmarks, targetExpression);

        this.faceMesh.geometry.attributes.position.needsUpdate = true;
    }

    /**
     * Morphs the face to show the target expression
     */
    applyExpressionMorph(positions, landmarks, expression) {
        const aspect = this.camera.aspect;
        const scaleX = 2.0;
        const scaleY = 2.0;

        switch (expression) {
            case 'Smile':
                // Lift mouth corners
                this.morphPoint(positions, landmarks, 61, 0, -0.15, 0, aspect, scaleX, scaleY); // Left corner
                this.morphPoint(positions, landmarks, 291, 0, -0.15, 0, aspect, scaleX, scaleY); // Right corner
                this.morphPoint(positions, landmarks, 0, 0, -0.08, 0, aspect, scaleX, scaleY); // Center lip
                this.morphPoint(positions, landmarks, 17, 0, -0.08, 0, aspect, scaleX, scaleY); // Lower lip
                // Squint eyes slightly
                this.morphPoint(positions, landmarks, 159, 0, 0.03, 0, aspect, scaleX, scaleY); // Left eye bottom
                this.morphPoint(positions, landmarks, 386, 0, 0.03, 0, aspect, scaleX, scaleY); // Right eye bottom
                break;

            case 'Surprise':
                // Raise eyebrows
                this.morphPoint(positions, landmarks, 70, 0, -0.2, 0, aspect, scaleX, scaleY); // Left brow
                this.morphPoint(positions, landmarks, 300, 0, -0.2, 0, aspect, scaleX, scaleY); // Right brow
                this.morphPoint(positions, landmarks, 63, 0, -0.15, 0, aspect, scaleX, scaleY);
                this.morphPoint(positions, landmarks, 293, 0, -0.15, 0, aspect, scaleX, scaleY);
                // Open mouth
                this.morphPoint(positions, landmarks, 14, 0, 0.25, 0, aspect, scaleX, scaleY); // Lower jaw
                this.morphPoint(positions, landmarks, 17, 0, 0.2, 0, aspect, scaleX, scaleY);
                this.morphPoint(positions, landmarks, 0, 0, 0.15, 0, aspect, scaleX, scaleY);
                // Widen eyes
                this.morphPoint(positions, landmarks, 159, 0, 0.08, 0, aspect, scaleX, scaleY);
                this.morphPoint(positions, landmarks, 386, 0, 0.08, 0, aspect, scaleX, scaleY);
                this.morphPoint(positions, landmarks, 145, 0, -0.08, 0, aspect, scaleX, scaleY);
                this.morphPoint(positions, landmarks, 374, 0, -0.08, 0, aspect, scaleX, scaleY);
                break;

            case 'Kiss':
                // Pucker lips
                this.morphPoint(positions, landmarks, 61, 0.08, 0, 0.1, aspect, scaleX, scaleY); // Left corner inward
                this.morphPoint(positions, landmarks, 291, -0.08, 0, 0.1, aspect, scaleX, scaleY); // Right corner inward
                this.morphPoint(positions, landmarks, 0, 0, 0, 0.15, aspect, scaleX, scaleY); // Push forward
                this.morphPoint(positions, landmarks, 17, 0, 0, 0.15, aspect, scaleX, scaleY);
                this.morphPoint(positions, landmarks, 13, 0, 0.05, 0.12, aspect, scaleX, scaleY);
                this.morphPoint(positions, landmarks, 14, 0, 0.05, 0.12, aspect, scaleX, scaleY);
                break;


            case 'Neutral':
                // No morphing needed - just use base landmarks
                break;
        }
    }

    /**
     * Helper to morph a specific landmark point
     */
    morphPoint(positions, landmarks, pointIndex, deltaX, deltaY, deltaZ, aspect, scaleX, scaleY) {
        const idx = pointIndex * 3;
        const p = landmarks[pointIndex];

        // Apply delta in normalized space, then project
        const newX = p.x + deltaX;
        const newY = p.y + deltaY;
        const newZ = p.z + deltaZ;

        positions[idx] = -(newX - 0.5) * scaleX * aspect;
        positions[idx + 1] = -(newY - 0.5) * scaleY;
        positions[idx + 2] = -newZ * 1.0;
    }

    /**
     * Trigger a particle explosion from the face center
     */
    triggerParticles() {
        if (!this.particles) return;

        const posAttr = this.particles.geometry.attributes.position;
        const velAttr = this.particles.geometry.attributes.velocity;
        const lifeAttr = this.particles.geometry.attributes.life;

        // Reset all particles
        const count = posAttr.count;
        for (let i = 0; i < count; i++) {
            const idx = i * 3;
            // Emit from roughly the center of the face (0,0) or varying slightly
            posAttr.array[idx] = (Math.random() - 0.5) * 0.2;
            posAttr.array[idx + 1] = (Math.random() - 0.5) * 0.2;
            posAttr.array[idx + 2] = (Math.random() - 0.5) * 0.2;

            // Random burst velocity
            const speed = 0.05 + Math.random() * 0.05;
            const angle = Math.random() * Math.PI * 2;
            const zAngle = Math.random() * Math.PI * 2;

            velAttr.array[idx] = Math.sin(angle) * Math.cos(zAngle) * speed;
            velAttr.array[idx + 1] = Math.sin(angle) * Math.sin(zAngle) * speed;
            velAttr.array[idx + 2] = Math.cos(angle) * speed;

            lifeAttr.array[i] = 1.0; // Full life
        }

        posAttr.needsUpdate = true;
        velAttr.needsUpdate = true;
        lifeAttr.needsUpdate = true;

        this.particles.userData.active = true;
    }

    updateParticles() {
        if (!this.particles || !this.particles.userData.active) return;

        const posAttr = this.particles.geometry.attributes.position;
        const velAttr = this.particles.geometry.attributes.velocity;
        const lifeAttr = this.particles.geometry.attributes.life;
        const count = posAttr.count;
        let activeCount = 0;

        for (let i = 0; i < count; i++) {
            if (lifeAttr.array[i] > 0) {
                const idx = i * 3;

                // Update Pos
                posAttr.array[idx] += velAttr.array[idx];
                posAttr.array[idx + 1] += velAttr.array[idx + 1];
                posAttr.array[idx + 2] += velAttr.array[idx + 2];

                // Decay
                lifeAttr.array[i] -= 0.02;
                activeCount++;
            } else {
                // Determine visuals for dead particles? Move offscreen
                posAttr.array[i * 3] = 9999;
            }
        }

        if (activeCount === 0) {
            this.particles.userData.active = false;
        }

        posAttr.needsUpdate = true;
        lifeAttr.needsUpdate = true;
    }

    render() {
        if (this.particles && this.particles.userData.active) {
            this.updateParticles();
        }
        this.renderer.render(this.scene, this.camera);
    }
}
