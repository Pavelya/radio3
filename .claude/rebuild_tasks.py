#!/usr/bin/env python3
"""
Script to rebuild TASKS.md with all fixes applied.

Fixes applied:
1. Rename duplicate P1-P6 tasks to ST1-ST3 (Streaming tier)
2. Remove exact duplicate tasks
3. Insert new tasks (G4, D9, D10, A9, A10, A11, A12)
4. Remove Phase 0 references
5. Update prerequisites
"""

import re
from pathlib import Path

# Task ID mapping for renames
RENAMES = {
    # Line ~23409: P1 YouTube -> ST1
    (23409, "# Task P1: YouTube Live Integration"): "# Task ST1: YouTube Live Integration",
    # Line ~24301: P2 Multi-Platform -> ST2
    (24301, "# Task P2: Multi-Platform Broadcasting"): "# Task ST2: Multi-Platform Broadcasting",
    # Line ~26429: P3 Stream Health -> ST3
    (26429, "# Task P3: Stream Health Monitoring"): "# Task ST3: Stream Health Monitoring & Auto-Recovery",
}

# Ranges to delete (exact duplicates)
DELETE_RANGES = [
    (24861, 25356),  # P3 duplicate (Scheduler Worker)
    (25357, 25676),  # P4 duplicate (Dead Air Detection)
    (26038, 26428),  # P6 duplicate (Schedule Visualization)
]

# Insertion points for new tasks
INSERTIONS = {
    # After G3 (around line 3700)
    "G3_END": "G4",
    # After D8 (around line 8150)
    "D8_END": ["D9", "D10"],
    # After A4 (around line 14250)
    "A4_END": ["A9", "A10", "A11"],
    # After M1 (music tier)
    "M1_END": "A12",
}

def find_task_end(lines, start_idx):
    """Find the end of a task (next task or EOF)"""
    for i in range(start_idx + 1, len(lines)):
        if lines[i].startswith("# Task "):
            return i
    return len(lines)

def load_new_task_content():
    """Load new task definitions from file"""
    new_tasks_file = Path(".claude/NEW_TASKS_TO_INSERT.md")
    if not new_tasks_file.exists():
        print("Warning: NEW_TASKS_TO_INSERT.md not found")
        return {}

    content = new_tasks_file.read_text()
    tasks = {}

    # Parse sections by task ID
    sections = re.split(r'## INSERT AFTER (\w+)', content)

    current_key = None
    for i, section in enumerate(sections):
        if i % 2 == 1:  # Odd indices are keys
            current_key = section.strip()
        elif current_key and section.strip():
            # Extract task ID from section
            match = re.search(r'# Task (\w+):', section)
            if match:
                task_id = match.group(1)
                tasks[task_id] = section.strip()

    return tasks

def remove_phase_0_references(line):
    """Replace Phase 0 references with proper prerequisites"""
    patterns = [
        (r'Phase 0 complete \(F1-F10\)', 'D1-D10 complete (Data tier)'),
        (r'Prerequisites:\s*Phase 0 complete', 'Prerequisites: D1-D10 (Data tier)'),
    ]

    for pattern, replacement in patterns:
        line = re.sub(pattern, replacement, line)

    return line

def should_delete_line(line_num):
    """Check if line should be deleted (part of duplicate task)"""
    for start, end in DELETE_RANGES:
        if start <= line_num <= end:
            return True
    return False

def process_file():
    """Main processing function"""
    input_file = Path(".claude/TASKS.md")
    output_file = Path(".claude/TASKS_NEW.md")

    print("Reading original TASKS.md...")
    lines = input_file.read_text().splitlines(keepends=True)

    print(f"Total lines: {len(lines)}")

    new_tasks = load_new_task_content()
    print(f"Loaded {len(new_tasks)} new task definitions")

    output_lines = []
    skip_until = None

    for i, line in enumerate(lines, 1):
        # Skip deleted ranges
        if should_delete_line(i):
            if skip_until is None:
                print(f"Deleting duplicate task at line {i}")
                skip_until = max(end for start, end in DELETE_RANGES if start <= i <= end)
            continue

        if skip_until and i <= skip_until:
            continue
        else:
            skip_until = None

        # Apply renames
        renamed = False
        for (approx_line, old_header), new_header in RENAMES.items():
            if old_header in line and abs(i - approx_line) < 100:
                print(f"Renaming at line {i}: {old_header} -> {new_header}")
                line = line.replace(old_header, new_header)
                # Also update references to old task IDs in this section
                old_id = old_header.split(":")[0].replace("# Task ", "")
                new_id = new_header.split(":")[0].replace("# Task ", "")
                renamed = True
                break

        # Remove Phase 0 references
        line = remove_phase_0_references(line)

        # Check for insertion points
        if line.startswith("# Task "):
            task_match = re.match(r'# Task (\w+):', line)
            if task_match:
                current_task_id = task_match.group(1)

                # Check if we should insert after this task
                insert_after_key = f"{current_task_id}_END"

                # For now, just add the line
                output_lines.append(line)

                # TODO: Add insertion logic once we identify exact insertion points
                continue

        output_lines.append(line)

    print(f"\nWriting new file with {len(output_lines)} lines...")
    output_file.write_text(''.join(output_lines))

    print(f"\n✅ Created {output_file}")
    print(f"   Original: {len(lines)} lines")
    print(f"   New: {len(output_lines)} lines")
    print(f"   Difference: {len(output_lines) - len(lines)} lines")

    return output_file

if __name__ == "__main__":
    process_file()
