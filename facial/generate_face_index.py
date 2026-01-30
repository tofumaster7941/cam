import os
import json
import sys

def main():
    target_dir = os.path.join(os.path.dirname(__file__), 'reference_faces')
    output_file = os.path.join(target_dir, 'faces.json')
    
    if not os.path.exists(target_dir):
        print(f"Directory not found: {target_dir}")
        return

    # Extensions to look for
    valid_exts = {'.jpg', '.jpeg', '.png', '.webp'}
    
    files = []
    print(f"Scanning {target_dir}...")
    
    for f in os.listdir(target_dir):
        ext = os.path.splitext(f)[1].lower()
        if ext in valid_exts:
            files.append(f)
            print(f"  Found: {f}")
            
    with open(output_file, 'w') as f:
        json.dump(files, f, indent=2)
        
    print(f"Saved index to {output_file} with {len(files)} images.")

if __name__ == "__main__":
    main()
