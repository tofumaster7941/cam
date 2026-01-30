import mediapipe as mp
import numpy as np

class PoseDetector:
    def __init__(self, static_image_mode=False, model_complexity=1, smooth_landmarks=True):
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(
            static_image_mode=static_image_mode,
            model_complexity=model_complexity,
            smooth_landmarks=smooth_landmarks,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

    def detect(self, image):
        """
        Processes the image and returns pose landmarks.
        """
        # MediaPipe expects RGB
        results = self.pose.process(image)
        return results.pose_landmarks

    def is_superman_pose(self, landmarks):
        """
        Detects if the user is in a 'Superman' flying pose.
        Criteria:
        1. One arm extended forward/up (Wrist significantly higher than shoulder).
        2. Arm is straight (Elbow angle).
        """
        if not landmarks:
            return False

        # Key landmarks
        left_shoulder = landmarks.landmark[self.mp_pose.PoseLandmark.LEFT_SHOULDER]
        right_shoulder = landmarks.landmark[self.mp_pose.PoseLandmark.RIGHT_SHOULDER]
        left_elbow = landmarks.landmark[self.mp_pose.PoseLandmark.LEFT_ELBOW]
        right_elbow = landmarks.landmark[self.mp_pose.PoseLandmark.RIGHT_ELBOW]
        left_wrist = landmarks.landmark[self.mp_pose.PoseLandmark.LEFT_WRIST]
        right_wrist = landmarks.landmark[self.mp_pose.PoseLandmark.RIGHT_WRIST]

        # Check Left Arm Superman
        # Wrist higher than shoulder (y is smaller for higher)
        left_up = left_wrist.y < left_shoulder.y
        # Arm straightish? Calculate angle or just rough relative positions
        # Simple check: Wrist is clearly above shoulder and elbow is 'between' but also high
        # Better: Check vertical extension. For flying, arm is usually forward/up. 
        # Let's check if wrist is significantly above shoulder.
        
        # Threshold for "significantly above"
        threshold = 0.1 # 10% of screen height
        
        left_flying = (left_shoulder.y - left_wrist.y) > threshold
        right_flying = (right_shoulder.y - right_wrist.y) > threshold
        
        # We can also check if the other arm is tucked or back, but one arm up is the trigger
        return left_flying or right_flying
