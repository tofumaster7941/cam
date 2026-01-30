import cv2
import mediapipe as mp
import numpy as np
import math

class ShieldApp:
    def __init__(self):
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        
        # Load Shield Asset
        # Using absolute path to the generated artifact
        self.shield_path = "/Users/ginapark/.gemini/antigravity/brain/dd71e901-2964-44a4-8dc6-21823272dd51/captain_america_shield_transparent_1768499225869.png"
        self.shield_img = cv2.imread(self.shield_path, cv2.IMREAD_UNCHANGED)
        
        if self.shield_img is None:
            print(f"Error: Could not load shield image from {self.shield_path}")
            # Fallback
            self.shield_img = np.zeros((200, 200, 4), dtype=np.uint8)
            cv2.circle(self.shield_img, (100, 100), 100, (0, 0, 255, 255), -1)
            cv2.circle(self.shield_img, (100, 100), 80, (255, 255, 255, 255), -1)
            cv2.circle(self.shield_img, (100, 100), 60, (0, 0, 255, 255), -1)
            cv2.circle(self.shield_img, (100, 100), 40, (255, 0, 0, 255), -1)
        else:
            # Ensure 4 channels
            if self.shield_img.shape[2] == 3:
                # Convert to BGRA
                self.shield_img = cv2.cvtColor(self.shield_img, cv2.COLOR_BGR2BGRA)
                
                # Create circular alpha mask (assuming shield is roughly centered and circular)
                h, w = self.shield_img.shape[:2]
                mask = np.zeros((h, w), dtype=np.uint8)
                center = (w // 2, h // 2)
                radius = min(w, h) // 2
                cv2.circle(mask, center, radius, 255, -1)
                
                # Apply mask to alpha channel
                self.shield_img[:, :, 3] = mask

    def detect_gesture(self, landmarks):
        """
        Detects if an arm is crossing the chest to summon the shield.
        Returns: ('left' or 'right', keypoints) or (None, None)
        """
        # Landmarks
        left_shoulder = landmarks.landmark[self.mp_pose.PoseLandmark.LEFT_SHOULDER]
        right_shoulder = landmarks.landmark[self.mp_pose.PoseLandmark.RIGHT_SHOULDER]
        left_elbow = landmarks.landmark[self.mp_pose.PoseLandmark.LEFT_ELBOW]
        right_elbow = landmarks.landmark[self.mp_pose.PoseLandmark.RIGHT_ELBOW]
        left_wrist = landmarks.landmark[self.mp_pose.PoseLandmark.LEFT_WRIST]
        right_wrist = landmarks.landmark[self.mp_pose.PoseLandmark.RIGHT_WRIST]
        
        # Check Right Arm crossing to Left Side
        # "Crossing" means Right Wrist is close to Left Shoulder
        # Dist calculation (simple 2D euclidean on normalized coords)
        # Note: aspect ratio matters for true distance, but rough check is fine
        
        # Cross Pose: Right Wrist near Left Shoulder/Chest
        rw_to_ls_dist = math.hypot(right_wrist.x - left_shoulder.x, right_wrist.y - left_shoulder.y)
        
        # Check Left Arm crossing to Right Side
        lw_to_rs_dist = math.hypot(left_wrist.x - right_shoulder.x, left_wrist.y - right_shoulder.y)
        
        threshold = 0.25 # Sensitivity
        
        if rw_to_ls_dist < threshold:
            return 'right_arm', (right_elbow, right_wrist)
        elif lw_to_rs_dist < threshold:
            return 'left_arm', (left_elbow, left_wrist)
            
        return None, None

    def overlay_shield(self, frame, arm_keypoints, shoulders_width_px):
        """
        Overlays the shield on the forearm.
        arm_keypoints: (elbow, wrist) landmarks
        """
        if not arm_keypoints:
            return frame
            
        elbow, wrist = arm_keypoints
        h, w, _ = frame.shape
        
        # Convert to pixels
        el_px = np.array([elbow.x * w, elbow.y * h])
        wr_px = np.array([wrist.x * w, wrist.y * h])
        
        # 1. Position: Center of forearm
        center = (el_px + wr_px) / 2
        
        # 2. Scale: Based on arm length or shoulder width
        # Arm length might be foreshortened if pointing at camera.
        # Shoulder width is more stable.
        # Let's use shoulder width passed in.
        shield_size = int(shoulders_width_px * 1.5) # Shield is big
        shield_size = max(50, shield_size)
        
        # 3. Rotation: Align with forearm
        # Vector from Elbow to Wrist
        vec = wr_px - el_px
        angle = math.degrees(math.atan2(vec[1], vec[0]))
        # Shield image is vertical/upright. 
        # If arm is horizontal, we want shield UP relative to current view or aligned with arm?
        # Usually shield is attached to forearm. So if forearm rotates, shield rotates.
        # Let's rotate it 90 deg?
        # Captain America shield is rotationally symmetric mostly (except star).
        # Let's explicitly align the 'up' of the shield with the 'up' of the arm (elbow to wrist?)
        # Actually star orientation matters. Let's rotate so 'up' aligns with forearm.
        rotation_angle = -angle - 90 # Adjust based on image native orientation
        
        # Resize Shield
        # Resize to square
        try:
            shield_resized = cv2.resize(self.shield_img, (shield_size, shield_size))
        except:
             return frame
            
        # Rotate Shield
        M = cv2.getRotationMatrix2D((shield_size//2, shield_size//2), rotation_angle, 1.0)
        shield_rotated = cv2.warpAffine(shield_resized, M, (shield_size, shield_size), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))
        
        # Overlay with Alpha
        # ROI on frame
        x1 = int(center[0] - shield_size // 2)
        y1 = int(center[1] - shield_size // 2)
        x2 = x1 + shield_size
        y2 = y1 + shield_size
        
        # Clip
        x1_c = max(0, x1)
        y1_c = max(0, y1)
        x2_c = min(w, x2)
        y2_c = min(h, y2)
        
        # Offsets in sprite
        sp_x1 = x1_c - x1
        sp_y1 = y1_c - y1
        sp_x2 = sp_x1 + (x2_c - x1_c)
        sp_y2 = sp_y1 + (y2_c - y1_c)
        
        if sp_x2 <= sp_x1 or sp_y2 <= sp_y1:
            return frame
            
        sprite_crop = shield_rotated[sp_y1:sp_y2, sp_x1:sp_x2]
        frame_crop = frame[y1_c:y2_c, x1_c:x2_c]
        
        # Blend
        alpha = sprite_crop[:, :, 3] / 255.0
        alpha_3d = np.stack((alpha,) * 3, axis=-1)
        
        bg = frame_crop * (1.0 - alpha_3d)
        fg = sprite_crop[:, :, :3] * alpha_3d
        
        frame[y1_c:y2_c, x1_c:x2_c] = (bg + fg).astype(np.uint8)
        
        return frame

    def run(self):
        cap = cv2.VideoCapture(0)
        print("Shield App Started. Press 'q' to quit.")
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            
            frame = cv2.flip(frame, 1)
            h, w, _ = frame.shape
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            results = self.pose.process(rgb_frame)
            
            if results.pose_landmarks:
                landmarks = results.pose_landmarks
                
                # Get scale reference
                ls = landmarks.landmark[self.mp_pose.PoseLandmark.LEFT_SHOULDER]
                rs = landmarks.landmark[self.mp_pose.PoseLandmark.RIGHT_SHOULDER]
                shoulders_width = math.hypot((ls.x - rs.x)*w, (ls.y - rs.y)*h)
                
                # Detect
                detected_arm, keypoints = self.detect_gesture(landmarks)
                
                if detected_arm:
                    # Overlay
                    frame = self.overlay_shield(frame, keypoints, shoulders_width)
                    cv2.putText(frame, "SHIELD ACTIVATED", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 0), 2)
            
            cv2.imshow('Captain America Shield', frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
                
        cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    app = ShieldApp()
    app.run()
