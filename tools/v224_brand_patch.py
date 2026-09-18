from pathlib import Path

p=Path('note-proofreader-v221.js')
s=p.read_text()
old="    'Préserve tels quels OLED, QLED, Neo QLED, Mini LED, Q-Symphony, SmartThings, Samsung et TCL lorsqu’ils sont présents.',"
new="    'Préserve tels quels OLED, QLED, Neo QLED, Mini LED, Q-Symphony, SmartThings, '+PRIMARY_BRAND+' et TCL lorsqu’ils sont présents.',"
assert old in s,'littéral marque introuvable'
s=s.replace(old,new,1)
p.write_text(s)

Path('tools/v224_brand_patch.py').unlink()
