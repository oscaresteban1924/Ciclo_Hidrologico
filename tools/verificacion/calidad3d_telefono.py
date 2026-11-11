# Módulo «Calidad del agua» en 3D en un teléfono (390 × 844). Capturas en /home/claude/shots/diag.
from playwright.sync_api import sync_playwright
OUT='/home/claude/shots/diag'
ARGS=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
    ctx=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg=ctx.new_page()
    logs=[]
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(900)
    pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Calidad del agua').first.click(); pg.wait_for_timeout(4000)
    pg.screenshot(path=f'{OUT}/qm-c0.png')
    pg.evaluate("() => window.scrollTo(0, 700)"); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/qm-c1.png')
    pg.evaluate("() => window.scrollTo(0, 0)"); pg.wait_for_timeout(300)
    pg.get_by_role('tab', name='Del río a la llave').click(); pg.wait_for_timeout(4000)
    pg.screenshot(path=f'{OUT}/qm-p0.png')
    pg.get_by_role('tab', name='La ciudad y la lluvia').click(); pg.wait_for_timeout(4000)
    pg.screenshot(path=f'{OUT}/qm-s0.png')
    b.close()
    print('\n'.join(logs) or 'sin errores')
