
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { FACE_TRIANGLES } from './faceGeometry.js';

export class Renderer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
    }

    init(videoElement) {
        // Scene
        this.scene = new THREE.Scene();

        // Load HDR Environment Map for Realistic Metal
        new RGBELoader()
            .setPath('./assets/')
            .load('royal_esplanade_1k.hdr', (texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                this.scene.environment = texture;
                // this.scene.background = texture; // Optional: hide background to see camera
            });

        // Camera
        const canvas = document.getElementById('output_canvas');
        this.container = document.getElementById('pip-container');

        // Use container size
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const aspect = width / height;

        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        this.camera.position.z = 2; // Move camera back to see plane at z=0

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: true,
            preserveDrawingBuffer: true,
            powerPreference: "high-performance"
        });

        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for fps
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        // Shadows
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Lighting for Metallic Look (Complementing Env Map)
        // Key Light
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(2, 5, 2);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        this.scene.add(dirLight);

        // Rim Light
        const rimLight = new THREE.SpotLight(0x00aaff, 5.0);
        rimLight.position.set(-2, 5, -2);
        rimLight.lookAt(0, 0, 0);
        this.scene.add(rimLight);

        // Initialize Face Visuals only
        this.initFaceVisuals();

        // Resize Listener
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }



    initFaceVisuals() {
        // --- COLORFUL FILLED FACE MESH ---
        // We use FACE_TRIANGLES from our geometry file
        const triangles = FACE_TRIANGLES;

        // Ensure divisible by 3
        const validLen = triangles.length - (triangles.length % 3);
        const triangleCount = validLen / 3;

        // Non-indexed geometry for flat-shaded look (sharp colors per triangle)
        const geometry = new THREE.BufferGeometry();

        // Positions: 3 vertices per triangle * 3 coords (x,y,z)
        const positions = new Float32Array(validLen * 3);
        // Colors: 3 vertices per triangle * 3 coords (r,g,b)
        const colors = new Float32Array(validLen * 3);

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Generate Random Colors per Triangle
        const colorPalette = [
            new THREE.Color(0xFF0055), // Radical Red
            new THREE.Color(0x00FF88), // Cyber Green
            new THREE.Color(0x00CCFF), // Electric Blue
            new THREE.Color(0xFFDD00), // Neon Yellow
            new THREE.Color(0x9D00FF), // Vivid Purple
            new THREE.Color(0xFF8800)  // Orange
        ];

        for (let i = 0; i < triangleCount; i++) {
            // Pick a random color for this triangle
            const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];

            // Or truly random:
            // const col = new THREE.Color().setHSL(Math.random(), 1.0, 0.5);

            // Assign to all 3 vertices of this triangle
            for (let v = 0; v < 3; v++) {
                const idx = (i * 3 + v) * 3;
                colors[idx] = col.r;
                colors[idx + 1] = col.g;
                colors[idx + 2] = col.b;
            }
        }

        // Material: Basic with Vertex Colors (Unlit for pure color pop or Standard for shine)
        // User asked for "different colors", let's make it pop.
        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.DoubleSide, // Ensure visible from inside if needed
            transparent: true,
            opacity: 0.85
        });

        this.faceMesh = new THREE.Mesh(geometry, material);
        this.faceMesh.frustumCulled = false;
        this.scene.add(this.faceMesh);
    }

    updateFaceVisuals(denseData) {
        if (!this.faceMesh || !denseData || !denseData.face || !denseData.face.points) return;

        const facePoints = denseData.face.points;
        const positions = this.faceMesh.geometry.attributes.position.array;
        const triangles = FACE_TRIANGLES;

        // Helper to project point (Cached params would be faster but this is JS)
        const dist = this.camera.position.z;
        const vFOV = THREE.MathUtils.degToRad(this.camera.fov);
        const height = 2 * Math.tan(vFOV / 2) * dist;
        const width = height * this.camera.aspect;

        const project = (p) => {
            return {
                x: (p.x - 0.5) * width,
                y: -(p.y - 0.5) * height,
                z: -(p.z || 0) * 1.5 // Consistent depth scale
            };
        };

        // Create a quick lookup for original landmarks [0..477]
        // denseData points list mixes original and interpolated.
        // We need efficient random access.
        const landmarks = new Array(478);
        for (const p of facePoints) {
            if (p.originalIndex !== undefined && p.originalIndex < 478) {
                landmarks[p.originalIndex] = p;
            }
        }

        // Update positions based on triangle indices
        let validUpdate = false;
        const validLen = triangles.length - (triangles.length % 3);

        for (let i = 0; i < validLen; i++) {
            const lmIndex = triangles[i];
            const point = landmarks[lmIndex];

            if (point) {
                const vec = project(point);
                positions[i * 3] = vec.x;
                positions[i * 3 + 1] = vec.y;
                positions[i * 3 + 2] = vec.z;
                validUpdate = true;
            } else {
                // If point missing (tracking lost), maybe collapse to 0 or keep last
                // We'll leave it (glitchy effect is better than explosion)
            }
        }

        if (validUpdate) {
            this.faceMesh.geometry.attributes.position.needsUpdate = true;
            this.faceMesh.visible = true;
        } else {
            this.faceMesh.visible = false;
        }
    }



    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    projectToScene(p) {
        if (!this.camera) return new THREE.Vector3();

        // Camera Params for projection
        const dist = this.camera.position.z;
        const vFOV = THREE.MathUtils.degToRad(this.camera.fov);
        const height = 2 * Math.tan(vFOV / 2) * dist;
        const width = height * this.camera.aspect;

        return new THREE.Vector3(
            (p.x - 0.5) * width,
            -(p.y - 0.5) * height,
            -(p.z || 0) * 1.0 // Scale Z
        );
    }

    render() {
        if (!this.renderer || !this.scene || !this.camera) return;
        this.renderer.render(this.scene, this.camera);
    }
}
