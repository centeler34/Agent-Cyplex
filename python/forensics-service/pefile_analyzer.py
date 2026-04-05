"""PE file static analysis."""

import os
from typing import Any


def analyze_pe(file_path: str = "", **kwargs: Any) -> dict:
    """Perform static analysis on a PE (Windows executable) file."""
    try:
        import pefile
    except ImportError:
        return {"error": "pefile not installed", "install": "pip install pefile"}

    if not file_path:
        return {"error": "file_path is required"}
    # Block path traversal (CWE-23)
    if ".." in file_path:
        return {"error": f"Path traversal blocked: {file_path}"}
    if not os.path.isfile(os.path.realpath(file_path)):
        return {"error": f"File not found: {file_path}"}

    pe = pefile.PE(file_path)

    # Basic info
    info = {
        "file": file_path,
        "machine": hex(pe.FILE_HEADER.Machine),
        "timestamp": pe.FILE_HEADER.TimeDateStamp,
        "entry_point": hex(pe.OPTIONAL_HEADER.AddressOfEntryPoint),
        "image_base": hex(pe.OPTIONAL_HEADER.ImageBase),
        "subsystem": pe.OPTIONAL_HEADER.Subsystem,
        "dll": pe.is_dll(),
        "exe": pe.is_exe(),
    }

    # Sections
    sections = []
    for section in pe.sections:
        sections.append({
            "name": section.Name.decode("utf-8", errors="ignore").strip("\x00"),
            "virtual_size": section.Misc_VirtualSize,
            "raw_size": section.SizeOfRawData,
            "entropy": section.get_entropy(),
            "characteristics": hex(section.Characteristics),
        })
    info["sections"] = sections

    # Imports
    imports = {}
    if hasattr(pe, "DIRECTORY_ENTRY_IMPORT"):
        for entry in pe.DIRECTORY_ENTRY_IMPORT:
            dll_name = entry.dll.decode("utf-8", errors="ignore")
            funcs = [imp.name.decode("utf-8", errors="ignore") for imp in entry.imports if imp.name]
            imports[dll_name] = funcs[:20]  # Limit per DLL
    info["imports"] = imports

    # Suspicious indicators
    suspicious = []
    suspicious_imports = {"VirtualAlloc", "VirtualProtect", "CreateRemoteThread", "WriteProcessMemory", "NtUnmapViewOfSection"}
    for dll, funcs in imports.items():
        for func in funcs:
            if func in suspicious_imports:
                suspicious.append(f"Suspicious import: {dll}!{func}")

    # High entropy sections (potential packing)
    for section in sections:
        if section["entropy"] > 7.0:
            suspicious.append(f"High entropy section: {section['name']} ({section['entropy']:.2f})")

    info["suspicious_indicators"] = suspicious

    pe.close()
    return info
