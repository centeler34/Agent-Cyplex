"""YARA rule scanning against file artifacts."""

from typing import Any


def scan_with_yara(file_path: str = "", rules_path: str = "", **kwargs: Any) -> dict:
    """Scan a file against YARA rules."""
    try:
        import yara
    except ImportError:
        return {"error": "yara-python not installed", "install": "pip install yara-python"}

    if not file_path:
        return {"error": "file_path is required"}

    matches: list[dict] = []

    if rules_path:
        rules = yara.compile(filepath=rules_path)
    else:
        # Built-in basic rules
        rules = yara.compile(source=BUILTIN_RULES)

    results = rules.match(file_path)
    for match in results:
        matches.append({
            "rule": match.rule,
            "tags": list(match.tags),
            "meta": dict(match.meta) if match.meta else {},
            "strings": [
                {"offset": s[0], "identifier": s[1], "data": s[2].hex()[:100]}
                for s in match.strings[:20]
            ],
        })

    return {
        "file": file_path,
        "rules_source": rules_path or "builtin",
        "match_count": len(matches),
        "matches": matches,
    }


BUILTIN_RULES = """
rule SuspiciousStrings {
    strings:
        $s1 = "cmd.exe" nocase
        $s2 = "/bin/sh" nocase
        $s3 = "powershell" nocase
        $s4 = "WScript.Shell" nocase
        $s5 = "eval(" nocase
        $s6 = "base64_decode" nocase
    condition:
        any of them
}

rule PackedExecutable {
    strings:
        $upx = "UPX!"
        $mew = "MEW"
        $aspack = ".aspack"
    condition:
        any of them
}

rule ReverseShell {
    strings:
        $rs1 = "/dev/tcp/" nocase
        $rs2 = "nc -e" nocase
        $rs3 = "ncat -e" nocase
        $rs4 = "bash -i >& /dev/tcp" nocase
    condition:
        any of them
}
"""
