"""Drop an unreferenced word/fontTable.xml (and its content-type override) and folder entries."""
import re
import shutil
import sys
import zipfile

src = sys.argv[1]
tmp = src + ".tmp"
with zipfile.ZipFile(src) as zin:
    rels = zin.read("word/_rels/document.xml.rels").decode("utf-8")
    referenced = "fontTable.xml" in rels
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            name = item.filename
            if name.endswith("/"):
                continue
            data = zin.read(name)
            if not referenced and name == "word/fontTable.xml":
                continue
            if not referenced and name == "[Content_Types].xml":
                data = re.sub(rb'<Override[^>]*PartName="/word/fontTable.xml"[^>]*/>', b"", data)
            zout.writestr(item, data)
shutil.move(tmp, src)
print("fontTable referenced:", referenced, "-> cleaned", src)
