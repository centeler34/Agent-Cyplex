"""File entropy calculation for packing/encryption detection."""

import math
from collections import Counter
from typing import Any


def calculate_entropy(file_path: str = "", block_size: int = 256, **kwargs: Any) -> dict:
    """Calculate Shannon entropy of a file, overall and per-block."""
    if not file_path:
        return {"error": "file_path is required"}

    with open(file_path, "rb") as f:
        data = f.read()

    overall = shannon_entropy(data)
    file_size = len(data)

    # Per-block entropy (useful for detecting packed sections)
    blocks = []
    for i in range(0, len(data), block_size):
        block = data[i : i + block_size]
        blocks.append({
            "offset": i,
            "size": len(block),
            "entropy": round(shannon_entropy(block), 4),
        })

    # Analysis
    assessment = "normal"
    if overall > 7.5:
        assessment = "likely_encrypted_or_packed"
    elif overall > 7.0:
        assessment = "possibly_packed"
    elif overall < 1.0:
        assessment = "very_low_entropy"

    # Find high-entropy regions
    high_entropy_regions = [b for b in blocks if b["entropy"] > 7.0]

    return {
        "file": file_path,
        "file_size": file_size,
        "overall_entropy": round(overall, 4),
        "max_entropy": 8.0,
        "assessment": assessment,
        "total_blocks": len(blocks),
        "high_entropy_blocks": len(high_entropy_regions),
        "block_size": block_size,
    }


def shannon_entropy(data: bytes) -> float:
    """Calculate Shannon entropy of a byte sequence."""
    if not data:
        return 0.0

    counter = Counter(data)
    length = len(data)
    entropy = 0.0

    for count in counter.values():
        p = count / length
        if p > 0:
            entropy -= p * math.log2(p)

    return entropy
