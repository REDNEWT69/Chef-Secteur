from pathlib import Path

slider=Path('period-day-slider.js')
s=slider.read_text()
old="""    const candidate=overnightCandidateSafe(),animate=overnightCuePulseRequested,candidateDate=String(candidate&&candidate.fromDate||'');
    box.querySelectorAll('.hotelDayBadge').forEach(b=>{const tab=b.closest('.dayTab');if(!candidate||!tab||tab.dataset.date!==candidateDate)b.remove()});
    box.querySelectorAll('.srOvernightRingV207').forEach(tab=>{if(!candidate||tab.dataset.date!==candidateDate||animate)tab.classList.remove('srOvernightRingV207')});
"""
new="""    const candidate=overnightCandidateSafe(),animate=overnightCuePulseRequested,candidateDate=String(candidate&&candidate.fromDate||'');
    box.querySelectorAll('.hotelDayBadge').forEach(b=>{const tab=b.closest('.dayTab');if(!candidate||!tab||tab.dataset.date!==candidateDate)b.remove()});
    box.querySelectorAll('.srOvernightDayV207').forEach(tab=>{if(!candidate||tab.dataset.date!==candidateDate)tab.classList.remove('srOvernightDayV207')});
    box.querySelectorAll('.srOvernightRingV207').forEach(tab=>{if(!candidate||tab.dataset.date!==candidateDate||animate)tab.classList.remove('srOvernightRingV207')});
"""
assert old in s,'sync cleanup anchor missing'
s=s.replace(old,new,1)
old2="""      if(tab){
        let badge=tab.querySelector('.hotelDayBadge');
"""
new2="""      if(tab){
        tab.classList.add('srOvernightDayV207');
        let badge=tab.querySelector('.hotelDayBadge');
"""
assert old2 in s,'candidate tab anchor missing'
s=s.replace(old2,new2,1)
old3='.periodDayTab.srOvernightRingV207::after{content:"";position:absolute;inset:-4px;border-radius:20px;padding:2px;background:'
new3='.periodDayTab.srOvernightDayV207:not(:has(.hotelDayBadge))::before{content:"🌙";position:absolute;top:4px;right:4px;display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;background:#fff4c2;border:1px solid rgba(154,98,0,.16);font-size:11px;line-height:1;box-shadow:0 2px 7px rgba(91,64,0,.10);z-index:3}.periodDayTab.active.srOvernightDayV207:not(:has(.hotelDayBadge))::before{content:"🌙 découché";position:static;width:auto;height:auto;display:inline-flex;margin:4px auto 0;padding:3px 5px;font-size:9px;font-weight:850;white-space:nowrap;color:#ffe08a;background:rgba(255,224,138,.12);border-color:rgba(255,224,138,.26);box-shadow:none}.periodDayTab.srOvernightRingV207::after{content:"";position:absolute;inset:-4px;border-radius:20px;padding:2px;background:'
assert old3 in s,'ring CSS anchor missing'
s=s.replace(old3,new3,1)
slider.write_text(s)

test=Path('tests/overnight-day-badge-browser.spec.cjs')
t=test.read_text()
marker="V207 : depuis le 17, le découché du 21 est déjà signalé sans charger sa semaine"
pos=t.index(marker)
needle="  expect(await badges(page)).toEqual(['2026-09-21 → 🌙 découché']);\n"
idx=t.index(needle,pos)
replacement="""  const futureMoon=await page.evaluate(()=>{
    const tab=document.querySelector('#dayTabs .dayTab[data-date="2026-09-21"]');if(!tab)return null;
    const before=getComputedStyle(tab,'::before');
    return{className:tab.className,content:before.content,display:before.display,width:before.width};
  });
  expect(futureMoon).not.toBeNull();
  expect(futureMoon.className).toContain('srOvernightDayV207');
  expect(futureMoon.content).toContain('🌙');
  expect(futureMoon.display).not.toBe('none');
"""
t=t[:idx]+replacement+t[idx+len(needle):]
test.write_text(t)
