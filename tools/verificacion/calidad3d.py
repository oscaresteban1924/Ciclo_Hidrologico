# Módulo «Calidad del agua» en 3D: retos, piedra, microscopio, jarras, lluvia y colorante (escritorio 1440 × 860).
# Capturas en /home/claude/shots/diag. Imprime las medallas ganadas y los errores de consola.
from playwright.sync_api import sync_playwright
OUT='/home/claude/shots/diag'
ARGS=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
    pg=b.new_page(viewport={'width':1440,'height':860})
    logs=[]
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type=='error' else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/'); pg.wait_for_timeout(900)
    pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Calidad del agua').click(); pg.wait_for_timeout(3500)
    # quebrada: reto de los peces
    pg.get_by_role('radio', name='Verano').click(); pg.wait_for_timeout(800)
    pg.screenshot(path=f'{OUT}/qi-c0-verano.png')
    pg.get_by_role('radio', name='Planta pequeña').click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{OUT}/qi-c1-ptar.png')
    pg.get_by_role('radio', name='Directo').click(); pg.wait_for_timeout(600)
    pg.get_by_role('tab', name='Experimentos').click(); pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Levantar la piedra').click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{OUT}/qi-c2-piedra.png')
    pg.locator('.q3-pscroll').evaluate("e => e.scrollTop = 900"); pg.wait_for_timeout(800)
    pg.screenshot(path=f'{OUT}/qi-c3-micro.png')
    pg.get_by_role('button', name='Ver el oxígeno').click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{OUT}/qi-c4-oxigeno.png')
    # planta: prueba de jarras
    pg.get_by_role('tab', name='Del río a la llave').click(); pg.wait_for_timeout(3500)
    pg.get_by_role('tab', name='Experimentos').click(); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Empezar la prueba').click(); pg.wait_for_timeout(5000)
    pg.screenshot(path=f'{OUT}/qi-p0-jarras-medio.png')
    pg.wait_for_timeout(9000)
    pg.screenshot(path=f'{OUT}/qi-p1-jarras-fin.png')
    btns = pg.locator('.q3-jar button').all()
    if len(btns) >= 4: btns[3].click()
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{OUT}/qi-p2-usar.png')
    # calle: lluvia y colorante
    pg.get_by_role('tab', name='La ciudad y la lluvia').click(); pg.wait_for_timeout(3500)
    pg.get_by_role('button', name='Que llueva (15 mm)').click(); pg.wait_for_timeout(4000)
    pg.screenshot(path=f'{OUT}/qi-s0-lloviendo.png')
    pg.wait_for_timeout(14000)
    pg.screenshot(path=f'{OUT}/qi-s1-llovio.png')
    pg.get_by_role('tab', name='Experimentos').click(); pg.wait_for_timeout(600)
    for i in range(1, 21):
        pg.locator('.q3-houses button', has_text=str(i)).first.click(); pg.wait_for_timeout(150)
        pg.wait_for_function("() => ![...document.querySelectorAll('.q3-houses button')].some(b => b.disabled)", timeout=30000)
        if i == 1: pg.screenshot(path=f'{OUT}/qi-s2-colorante.png')
    pg.wait_for_timeout(1000)
    pg.get_by_role('tab', name='Retos').click(); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/qi-s3-retos.png')
    print(pg.evaluate("() => localStorage.getItem('ciclo-hidrologico:calidad-retos')"))
    b.close()
    print('\n'.join(logs[:15]) or 'consola limpia')
