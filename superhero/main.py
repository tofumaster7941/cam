import cv2
import time
import numpy as np
import sys
from camera2.pose_detector import PoseDetector
from camera2.segmentation import Segmentor
from camera2.effects import Effects

def main():
    # Initialize components
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    # Set resolution
    width = 1280
    height = 720
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

    # Re-read actual width/height
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    print(f"Camera resolution: {width}x{height}")

    pose_detector = PoseDetector()
    segmentor = Segmentor()
    effects = Effects(width, height)
    
    print("Starting Superhero Flying Effect application...")
    print("Press 'q' to quit.")

    is_flying = False
    is_landing = False
    was_flying = False
    
    pose_start_time = None
    pose_loss_time = None
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab frame.")
            break

        # Flip frame horizontally for mirror view
        frame = cv2.flip(frame, 1)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 1. Detect Pose
        landmarks = pose_detector.detect(rgb_frame)
        current_flying_state = pose_detector.is_superman_pose(landmarks)
        
        # State transitions with delays
        current_time = time.time()
        
        if current_flying_state:
            # User is holding pose
            pose_loss_time = None # Reset loss timer
            
            if not is_flying and not is_landing:
                # Counting down to start
                if pose_start_time is None:
                    pose_start_time = current_time
                elif current_time - pose_start_time > 2.0:
                    is_flying = True
                    is_landing = False
        else:
            # User dropped pose
            pose_start_time = None # Reset start timer
            
            if is_flying:
                # Counting down to land
                if pose_loss_time is None:
                    pose_loss_time = current_time
                elif current_time - pose_loss_time > 2.0:
                    is_flying = False
                    is_landing = True
                    effects.trigger_landing()
        
        output_frame = frame
        
        # Helper to decide what frame to show
        if is_flying:
            # Trigger launch if this is the first frame of flying
            if not was_flying:
                effects.trigger_launch()
                # Capture the body sprite!
                _, mask = segmentor.remove_background(frame, background_image=None) 
                
                mask_3d = np.stack((mask,) * 3, axis=-1)
                sprite_rgb = (frame * mask_3d).astype(np.uint8)
                sprite_mask = mask_3d
                
                effects.set_sprite(sprite_rgb, sprite_mask)
                
            sky_bg = effects.get_background_frame()
            output_frame = effects.overlay_sprite(sky_bg)
            
            # Show Landing Countdown if applicable
            if pose_loss_time:
                 remaining = 2.0 - (current_time - pose_loss_time)
                 cv2.putText(output_frame, f"Landing in {remaining:.1f}s...", (50, 100), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
            else:
                 cv2.putText(output_frame, "SUPERMAN MODE ACTIVATED!", (50, 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 3)

                        
        elif is_landing:
            # Get Landing Background
            landing_bg = effects.get_background_frame()
            
            if landing_bg is None:
                # Landing complete
                is_landing = False
                output_frame = frame # Back to webcam
            else:
                 output_frame = effects.overlay_sprite(landing_bg)
                 cv2.putText(output_frame, "Coming in for landing...", (50, 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 3)

        else:
            # Normal live view
            output_frame = frame
            
            if pose_start_time:
                 remaining = 2.0 - (current_time - pose_start_time)
                 cv2.putText(output_frame, f"Launching in {remaining:.1f}s...", (50, 90), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 165, 255), 3)
            else:
                 cv2.putText(output_frame, "Strike the Pose!", (50, 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                        
        # Display
        cv2.imshow('Superhero Flying Effect', output_frame)
        
        was_flying = is_flying

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
