"""Emit a lean production copy of the generated factory.

Drops evidence/provenance metadata that the runtime never reads (it stays in the
ObjectSculptSpec) and keeps only the material fields createSculptMaterial reads.
Usage: strip_factory.py <in.ts> <out.ts>
"""
import json
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
text = open(src).read()

DROP_USERDATA = re.compile(
    r"^\s*[\w.]+\.userData\.(sculptComponent|actionProfile|reconstructionEvidence|materialPipeline|materialReferenceRegistry) = .*;\n",
    re.M,
)
text, dropped = DROP_USERDATA.subn("", text)

MATERIAL_KEYS = {
    "id", "baseColor", "color", "albedo", "roughness", "metalness", "clearcoat", "clearcoatRoughness",
    "transmission", "ior", "thickness", "attenuationDistance", "attenuationColor", "sheen", "sheenColor",
    "sheenRoughness", "iridescence", "iridescenceIOR", "anisotropy", "specularF0", "f0", "specularIntensity",
    "specularColor", "emissive", "emissiveIntensity", "opacity", "alpha", "doubleSided", "flatShading",
    "envMapIntensity", "colorGradient", "topologyClass", "denseMesh", "geometryDensity", "textureless",
}


def lean_material(match: re.Match) -> str:
    spec = json.loads(match.group(2))
    lean = {k: v for k, v in spec.items() if k in MATERIAL_KEYS}
    if isinstance(lean.get("albedo"), dict):
        lean["albedo"] = {"dominant": lean["albedo"].get("dominant")}
    if isinstance(lean.get("textureless"), dict):
        lean["textureless"] = {"declared": lean["textureless"].get("declared") is True}
    return f"{match.group(1)}{json.dumps(lean, ensure_ascii=False)},\n"


MATERIAL_LITERAL = re.compile(r'(createSculptMaterial\(\n\s*"[^"]+",\n\s*)(\{.*\}),\n')
text, materials = MATERIAL_LITERAL.subn(lean_material, text)

header = (
    "// Gerado pelo img2threejs a partir de docs/modelo-van/object-sculpt-spec.json e enxugado por\n"
    "// docs/modelo-van/strip_factory.py. Não editar à mão: altere a spec e gere de novo.\n"
)
open(dst, "w").write(header + text)
print(f"dropped {dropped} metadata lines, leaned {materials} material literals: "
      f"{len(open(src).read())} -> {len(header + text)} bytes")
